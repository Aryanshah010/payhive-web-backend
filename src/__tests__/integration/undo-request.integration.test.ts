import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";
import { UndoRequestModel } from "../../models/undo-request.model";
import { TransactionModel } from "../../models/transaction.model";

const prefix = "itest-undo+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);

    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });

    return {
        user,
        token: loginRes.body.token as string,
        id: loginRes.body.data._id as string,
    };
};

const setPin = async (token: string, pin: string = "1234") => {
    await request(app)
        .put("/api/profile/pin")
        .set("Authorization", `Bearer ${token}`)
        .send({ pin })
        .expect(200);
};

const seedBalance = async (userId: string, balance: number) => {
    await UserModel.findByIdAndUpdate(userId, { balance });
};

const createTransfer = async (senderToken: string, toPhoneNumber: string, amount: number, pin: string = "1234") => {
    const transferRes = await request(app)
        .post("/api/transactions/confirm")
        .set("Authorization", `Bearer ${senderToken}`)
        .send({
            toPhoneNumber,
            amount,
            remark: "undo base transfer",
            pin,
        })
        .expect(200);

    return transferRes.body.data.receipt.txId as string;
};

const createUndoRequest = async (senderToken: string, txId: string) => {
    return request(app)
        .post("/api/undo-requests")
        .set("Authorization", `Bearer ${senderToken}`)
        .send({ txId });
};

describe("Undo Request Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("create undo request success sends receiver notification", async () => {
        const sender = await registerAndLogin("create-sender");
        const receiver = await registerAndLogin("create-receiver");

        await setPin(sender.token);
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 125);

        const createRes = await createUndoRequest(sender.token, txId);
        expect(createRes.statusCode).toBe(201);
        expect(createRes.body.success).toBe(true);
        expect(createRes.body.data.status).toBe("PENDING");

        const undoRequestId = createRes.body.data.id as string;

        const receiverNotifs = await request(app)
            .get("/api/notifications?type=UNDO_REQUEST")
            .set("Authorization", `Bearer ${receiver.token}`)
            .expect(200);

        const createdNotification = receiverNotifs.body.data.items.find((item: any) => {
            return item?.data?.undoRequestId === undoRequestId && item?.data?.action === "CREATED";
        });

        expect(createdNotification).toBeDefined();
        expect(createdNotification.data.originalTxId).toBe(txId);
    });

    test("duplicate undo request is blocked forever for same transaction", async () => {
        const sender = await registerAndLogin("dup-sender");
        const receiver = await registerAndLogin("dup-receiver");

        await setPin(sender.token);
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 90);

        const firstCreate = await createUndoRequest(sender.token, txId);
        expect(firstCreate.statusCode).toBe(201);

        const requestId = firstCreate.body.data.id as string;
        await request(app)
            .post(`/api/undo-requests/${requestId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({})
            .expect(200);

        const secondCreate = await createUndoRequest(sender.token, txId);
        expect(secondCreate.statusCode).toBe(409);
        expect(secondCreate.body.message).toContain("Undo already requested");
    });

    test("create undo request rejects non-sender access", async () => {
        const sender = await registerAndLogin("scope-sender");
        const receiver = await registerAndLogin("scope-receiver");

        await setPin(sender.token);
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 110);

        const res = await createUndoRequest(receiver.token, txId);
        expect(res.statusCode).toBe(404);
    });

    test("create undo request rejects non-success and non-transfer transactions", async () => {
        const sender = await registerAndLogin("scope2-sender");
        const receiver = await registerAndLogin("scope2-receiver");

        await setPin(sender.token);
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 100);

        await TransactionModel.findOneAndUpdate(
            { txId },
            {
                status: "FAILED",
            }
        );

        const failedStatusRes = await createUndoRequest(sender.token, txId);
        expect(failedStatusRes.statusCode).toBe(409);
        expect(failedStatusRes.body.message).toContain("Only successful transactions");

        await TransactionModel.findOneAndUpdate(
            { txId },
            {
                status: "SUCCESS",
                paymentType: "BANK_TRANSFER",
            }
        );

        const nonTransferRes = await createUndoRequest(sender.token, txId);
        expect(nonTransferRes.statusCode).toBe(400);
        expect(nonTransferRes.body.message).toContain("Undo is only supported for transfer transactions");
    });

    test("accept undo request success refunds atomically and marks accepted", async () => {
        const sender = await registerAndLogin("accept-sender");
        const receiver = await registerAndLogin("accept-receiver");

        await setPin(sender.token, "1234");
        await setPin(receiver.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 200, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" });

        expect(acceptRes.statusCode).toBe(200);
        expect(acceptRes.body.success).toBe(true);
        expect(acceptRes.body.data.request.status).toBe("ACCEPTED");
        expect(acceptRes.body.data.request.refundTransactionId).toBeTruthy();
        expect(acceptRes.body.data.receipt.meta.reason).toBe("UNDO_REFUND");
        expect(acceptRes.body.data.receipt.meta.originalTxId).toBe(txId);

        const updatedSender = await UserModel.findById(sender.id);
        const updatedReceiver = await UserModel.findById(receiver.id);
        expect(updatedSender?.balance).toBe(1000);
        expect(updatedReceiver?.balance).toBe(0);

        const senderUndoNotifs = await request(app)
            .get("/api/notifications?type=UNDO_REQUEST")
            .set("Authorization", `Bearer ${sender.token}`)
            .expect(200);

        const acceptedNotification = senderUndoNotifs.body.data.items.find((item: any) => {
            return item?.data?.undoRequestId === undoRequestId && item?.data?.action === "ACCEPTED";
        });

        expect(acceptedNotification).toBeDefined();
    });

    test("accept undo request with wrong PIN fails and keeps pending", async () => {
        const sender = await registerAndLogin("wrongpin-sender");
        const receiver = await registerAndLogin("wrongpin-receiver");

        await setPin(sender.token, "1234");
        await setPin(receiver.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 130, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "0000" });

        expect(acceptRes.statusCode).toBe(401);

        const receiverDoc = await UserModel.findById(receiver.id);
        expect(receiverDoc?.pinAttempts).toBe(1);

        const undoRequest = await UndoRequestModel.findById(undoRequestId);
        expect(undoRequest?.status).toBe("PENDING");
    });

    test("accept undo request with insufficient balance fails and keeps pending", async () => {
        const sender = await registerAndLogin("insufficient-sender");
        const receiver = await registerAndLogin("insufficient-receiver");

        await setPin(sender.token, "1234");
        await setPin(receiver.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 150, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        await seedBalance(receiver.id, 0);

        const acceptRes = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" });

        expect(acceptRes.statusCode).toBe(400);
        expect(acceptRes.body.message).toContain("Insufficient balance");

        const undoRequest = await UndoRequestModel.findById(undoRequestId);
        expect(undoRequest?.status).toBe("PENDING");
        expect(undoRequest?.refundTransactionId).toBeNull();
    });

    test("accept endpoint is idempotent after success", async () => {
        const sender = await registerAndLogin("idem-sender");
        const receiver = await registerAndLogin("idem-receiver");

        await setPin(sender.token, "1234");
        await setPin(receiver.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 160, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        const firstAccept = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        const secondAccept = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        expect(secondAccept.body.data.request.status).toBe("ACCEPTED");
        expect(secondAccept.body.data.receipt.txId).toBe(firstAccept.body.data.receipt.txId);
    });

    test("reject undo request success sends denied notification and is idempotent", async () => {
        const sender = await registerAndLogin("reject-sender");
        const receiver = await registerAndLogin("reject-receiver");

        await setPin(sender.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 75, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        const firstReject = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({});

        expect(firstReject.statusCode).toBe(200);
        expect(firstReject.body.data.status).toBe("DENIED");

        const secondReject = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({});

        expect(secondReject.statusCode).toBe(200);
        expect(secondReject.body.data.status).toBe("DENIED");

        const senderUndoNotifs = await request(app)
            .get("/api/notifications?type=UNDO_REQUEST")
            .set("Authorization", `Bearer ${sender.token}`)
            .expect(200);

        const deniedNotification = senderUndoNotifs.body.data.items.find((item: any) => {
            return item?.data?.undoRequestId === undoRequestId && item?.data?.action === "DENIED";
        });

        expect(deniedNotification).toBeDefined();
    });

    test("terminal conflicts: reject after accepted and accept after denied return 409", async () => {
        const senderA = await registerAndLogin("terminalA-sender");
        const receiverA = await registerAndLogin("terminalA-receiver");

        await setPin(senderA.token, "1234");
        await setPin(receiverA.token, "1234");
        await seedBalance(senderA.id, 1000);

        const txIdA = await createTransfer(senderA.token, receiverA.user.phoneNumber, 140, "1234");
        const createResA = await createUndoRequest(senderA.token, txIdA);
        const requestIdA = createResA.body.data.id as string;

        await request(app)
            .post(`/api/undo-requests/${requestIdA}/accept`)
            .set("Authorization", `Bearer ${receiverA.token}`)
            .send({ pin: "1234" })
            .expect(200);

        const rejectAfterAccept = await request(app)
            .post(`/api/undo-requests/${requestIdA}/reject`)
            .set("Authorization", `Bearer ${receiverA.token}`)
            .send({});
        expect(rejectAfterAccept.statusCode).toBe(409);

        const senderB = await registerAndLogin("terminalB-sender");
        const receiverB = await registerAndLogin("terminalB-receiver");

        await setPin(senderB.token, "1234");
        await setPin(receiverB.token, "1234");
        await seedBalance(senderB.id, 1000);

        const txIdB = await createTransfer(senderB.token, receiverB.user.phoneNumber, 145, "1234");
        const createResB = await createUndoRequest(senderB.token, txIdB);
        const requestIdB = createResB.body.data.id as string;

        await request(app)
            .post(`/api/undo-requests/${requestIdB}/reject`)
            .set("Authorization", `Bearer ${receiverB.token}`)
            .send({})
            .expect(200);

        const acceptAfterReject = await request(app)
            .post(`/api/undo-requests/${requestIdB}/accept`)
            .set("Authorization", `Bearer ${receiverB.token}`)
            .send({ pin: "1234" });
        expect(acceptAfterReject.statusCode).toBe(409);
    });

    test("non-receiver cannot accept or reject", async () => {
        const sender = await registerAndLogin("owner-sender");
        const receiver = await registerAndLogin("owner-receiver");
        const intruder = await registerAndLogin("owner-intruder");

        await setPin(sender.token, "1234");
        await seedBalance(sender.id, 1000);

        const txId = await createTransfer(sender.token, receiver.user.phoneNumber, 120, "1234");
        const createRes = await createUndoRequest(sender.token, txId);
        const undoRequestId = createRes.body.data.id as string;

        const intruderAccept = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/accept`)
            .set("Authorization", `Bearer ${intruder.token}`)
            .send({ pin: "1234" });
        expect(intruderAccept.statusCode).toBe(404);

        const intruderReject = await request(app)
            .post(`/api/undo-requests/${undoRequestId}/reject`)
            .set("Authorization", `Bearer ${intruder.token}`)
            .send({});
        expect(intruderReject.statusCode).toBe(404);
    });
});

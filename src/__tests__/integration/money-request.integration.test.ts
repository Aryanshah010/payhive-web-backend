import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";
import { MoneyRequestModel } from "../../models/money-request.model";

const prefix = "itest-moneyreq+";

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

describe("Money Request Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("create request success sends receiver notification with CREATED action", async () => {
        const requester = await registerAndLogin("create-requester");
        const receiver = await registerAndLogin("create-receiver");

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 175,
                remark: "rent due",
            });

        expect(createRes.statusCode).toBe(201);
        expect(createRes.body.success).toBe(true);
        expect(createRes.body.data.status).toBe("PENDING");

        const moneyRequestId = createRes.body.data.id as string;

        const receiverNotifs = await request(app)
            .get("/api/notifications?type=REQUEST_MONEY")
            .set("Authorization", `Bearer ${receiver.token}`);

        expect(receiverNotifs.statusCode).toBe(200);

        const createdNotification = receiverNotifs.body.data.items.find((item: any) => {
            return (
                item?.data?.moneyRequestId === moneyRequestId &&
                item?.data?.action === "CREATED"
            );
        });

        expect(createdNotification).toBeDefined();
    });

    test("create request fails for self and unknown phone", async () => {
        const requester = await registerAndLogin("create-fail");

        const selfRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: requester.user.phoneNumber,
                amount: 50,
            });

        expect(selfRes.statusCode).toBe(400);

        const unknownRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: "9000000000",
                amount: 50,
            });

        expect(unknownRes.statusCode).toBe(404);
    });

    test("incoming and outgoing endpoints support status filters", async () => {
        const requester = await registerAndLogin("list-requester");
        const receiver = await registerAndLogin("list-receiver");

        const first = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 100,
                remark: "first",
            })
            .expect(201);

        await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 200,
                remark: "second",
            })
            .expect(201);

        await request(app)
            .post(`/api/money-requests/${first.body.data.id}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({})
            .expect(200);

        const incomingRejected = await request(app)
            .get("/api/money-requests/incoming?status=rejected")
            .set("Authorization", `Bearer ${receiver.token}`);

        expect(incomingRejected.statusCode).toBe(200);
        expect(incomingRejected.body.data.items.length).toBe(1);
        expect(incomingRejected.body.data.items[0].status).toBe("REJECTED");

        const outgoingPending = await request(app)
            .get("/api/money-requests/outgoing?status=pending")
            .set("Authorization", `Bearer ${requester.token}`);

        expect(outgoingPending.statusCode).toBe(200);
        expect(outgoingPending.body.data.items.length).toBe(1);
        expect(outgoingPending.body.data.items[0].status).toBe("PENDING");
    });

    test("accept request success creates transaction and updates balances/history", async () => {
        const requester = await registerAndLogin("accept-requester");
        const receiver = await registerAndLogin("accept-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(receiver.id, { balance: 1000 });

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 125,
                remark: "settle lunch",
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" });

        expect(acceptRes.statusCode).toBe(200);
        expect(acceptRes.body.data.request.status).toBe("ACCEPTED");
        expect(acceptRes.body.data.request.transactionId).toBeTruthy();
        expect(acceptRes.body.data.receipt.meta.moneyRequestId).toBe(moneyRequestId);

        const updatedReceiver = await UserModel.findById(receiver.id);
        const updatedRequester = await UserModel.findById(requester.id);
        expect(updatedReceiver?.balance).toBe(875);
        expect(updatedRequester?.balance).toBe(125);

        const receiverHistory = await request(app)
            .get("/api/transactions?direction=debit")
            .set("Authorization", `Bearer ${receiver.token}`);

        expect(receiverHistory.statusCode).toBe(200);
        expect(
            receiverHistory.body.data.items.some((item: any) => item.txId === acceptRes.body.data.receipt.txId)
        ).toBe(true);
    });

    test("accept request with wrong PIN fails and keeps request pending", async () => {
        const requester = await registerAndLogin("wrong-pin-requester");
        const receiver = await registerAndLogin("wrong-pin-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(receiver.id, { balance: 1000 });

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 100,
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "0000" });

        expect(acceptRes.statusCode).toBe(401);

        const receiverDoc = await UserModel.findById(receiver.id);
        expect(receiverDoc?.pinAttempts).toBe(1);

        const requestRes = await request(app)
            .get(`/api/money-requests/${moneyRequestId}`)
            .set("Authorization", `Bearer ${receiver.token}`);

        expect(requestRes.statusCode).toBe(200);
        expect(requestRes.body.data.status).toBe("PENDING");
    });

    test("accept request fails on insufficient balance and request remains pending", async () => {
        const requester = await registerAndLogin("insufficient-requester");
        const receiver = await registerAndLogin("insufficient-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(receiver.id, { balance: 50 });

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 100,
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" });

        expect(acceptRes.statusCode).toBe(400);
        expect(acceptRes.body.message).toContain("Insufficient balance");

        const requestRes = await request(app)
            .get(`/api/money-requests/${moneyRequestId}`)
            .set("Authorization", `Bearer ${receiver.token}`);
        expect(requestRes.statusCode).toBe(200);
        expect(requestRes.body.data.status).toBe("PENDING");
    });

    test("transactions confirm with moneyRequestId marks request accepted (app compatibility)", async () => {
        const requester = await registerAndLogin("compat-requester");
        const receiver = await registerAndLogin("compat-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);
        await UserModel.findByIdAndUpdate(receiver.id, { balance: 1000 });

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 130,
                remark: "compat accept",
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const confirmRes = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${receiver.token}`)
            .set("Idempotency-Key", "compat-money-request-idem-123456")
            .send({
                toPhoneNumber: requester.user.phoneNumber,
                amount: 130,
                remark: "compat accept",
                moneyRequestId,
                pin: "1234",
            });

        expect(confirmRes.statusCode).toBe(200);
        expect(confirmRes.body.data.receipt.meta.moneyRequestId).toBe(moneyRequestId);

        const detailRes = await request(app)
            .get(`/api/money-requests/${moneyRequestId}`)
            .set("Authorization", `Bearer ${receiver.token}`);
        expect(detailRes.statusCode).toBe(200);
        expect(detailRes.body.data.status).toBe("ACCEPTED");
        expect(detailRes.body.data.transactionId).toBeTruthy();
    });

    test("reject and cancel send lifecycle notifications", async () => {
        const requester = await registerAndLogin("lifecycle-requester");
        const receiver = await registerAndLogin("lifecycle-receiver");

        const rejectReq = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 80,
            })
            .expect(201);

        const rejectId = rejectReq.body.data.id as string;

        const rejectRes = await request(app)
            .post(`/api/money-requests/${rejectId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({});

        expect(rejectRes.statusCode).toBe(200);
        expect(rejectRes.body.data.status).toBe("REJECTED");

        const requesterNotifs = await request(app)
            .get("/api/notifications?type=REQUEST_MONEY")
            .set("Authorization", `Bearer ${requester.token}`);
        const rejectedNotification = requesterNotifs.body.data.items.find((item: any) => {
            return item?.data?.moneyRequestId === rejectId && item?.data?.action === "REJECTED";
        });
        expect(rejectedNotification).toBeDefined();

        const cancelReq = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 90,
            })
            .expect(201);

        const cancelId = cancelReq.body.data.id as string;

        const cancelRes = await request(app)
            .post(`/api/money-requests/${cancelId}/cancel`)
            .set("Authorization", `Bearer ${requester.token}`)
            .send({});

        expect(cancelRes.statusCode).toBe(200);
        expect(cancelRes.body.data.status).toBe("CANCELED");

        const receiverNotifs = await request(app)
            .get("/api/notifications?type=REQUEST_MONEY")
            .set("Authorization", `Bearer ${receiver.token}`);
        const canceledNotification = receiverNotifs.body.data.items.find((item: any) => {
            return item?.data?.moneyRequestId === cancelId && item?.data?.action === "CANCELED";
        });
        expect(canceledNotification).toBeDefined();
    });

    test("non-owner cannot accept reject or cancel", async () => {
        const requester = await registerAndLogin("owner-requester");
        const receiver = await registerAndLogin("owner-receiver");
        const intruder = await registerAndLogin("intruder");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 45,
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const acceptRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${intruder.token}`)
            .send({ pin: "1234" });
        expect(acceptRes.statusCode).toBe(404);

        const rejectRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/reject`)
            .set("Authorization", `Bearer ${intruder.token}`)
            .send({});
        expect(rejectRes.statusCode).toBe(404);

        const cancelRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/cancel`)
            .set("Authorization", `Bearer ${intruder.token}`)
            .send({});
        expect(cancelRes.statusCode).toBe(404);
    });

    test("accepting expired request returns 410 and marks request expired", async () => {
        const requester = await registerAndLogin("expired-requester");
        const receiver = await registerAndLogin("expired-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 60,
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;
        await MoneyRequestModel.findByIdAndUpdate(moneyRequestId, {
            expiresAt: new Date(Date.now() - 5 * 60 * 1000),
            status: "PENDING",
        });

        const acceptRes = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" });

        expect(acceptRes.statusCode).toBe(410);

        const detailRes = await request(app)
            .get(`/api/money-requests/${moneyRequestId}`)
            .set("Authorization", `Bearer ${receiver.token}`);
        expect(detailRes.statusCode).toBe(200);
        expect(detailRes.body.data.status).toBe("EXPIRED");
    });

    test("accept endpoint is idempotent after success and terminal states return conflict", async () => {
        const requester = await registerAndLogin("idem-requester");
        const receiver = await registerAndLogin("idem-receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);
        await UserModel.findByIdAndUpdate(receiver.id, { balance: 1000 });

        const createRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 150,
            })
            .expect(201);

        const moneyRequestId = createRes.body.data.id as string;

        const firstAccept = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        const secondAccept = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/accept`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ pin: "1234" })
            .expect(200);

        expect(secondAccept.body.data.receipt.txId).toBe(firstAccept.body.data.receipt.txId);

        const rejectAfterAccept = await request(app)
            .post(`/api/money-requests/${moneyRequestId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({});
        expect(rejectAfterAccept.statusCode).toBe(409);
    });

    test("respond endpoint supports REJECT and CANCEL actions (app compatibility)", async () => {
        const requester = await registerAndLogin("respond-requester");
        const receiver = await registerAndLogin("respond-receiver");

        const rejectReq = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 40,
            })
            .expect(201);

        const rejectRes = await request(app)
            .post(`/api/money-requests/${rejectReq.body.data.id}/respond`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({ action: "REJECT" });

        expect(rejectRes.statusCode).toBe(200);
        expect(rejectRes.body.data.status).toBe("REJECTED");

        const cancelReq = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 41,
            })
            .expect(201);

        const cancelRes = await request(app)
            .post(`/api/money-requests/${cancelReq.body.data.id}/respond`)
            .set("Authorization", `Bearer ${requester.token}`)
            .send({ action: "CANCEL" });

        expect(cancelRes.statusCode).toBe(200);
        expect(cancelRes.body.data.status).toBe("CANCELED");
    });
});

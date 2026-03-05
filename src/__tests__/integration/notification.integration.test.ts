import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";

const prefix = "itest-notify+";
const internalToken = process.env.INTERNAL_NOTIFICATION_SECRET || "itest-internal-secret";

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
        deviceId: loginRes.body.deviceId as string,
    };
};

describe("Notification Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("internal create + list + read + read-all", async () => {
        const account = await registerAndLogin("feed-user");

        const firstCreate = await request(app)
            .post("/api/notifications")
            .set("X-Internal-Token", internalToken)
            .send({
                userId: account.id,
                title: "Undo Request",
                body: "Undo requested for Rs. 500",
                type: "UNDO_REQUEST",
                data: {
                    txId: "tx-feed-1",
                    amount: 500,
                },
            });

        expect(firstCreate.statusCode).toBe(201);
        expect(firstCreate.body.success).toBe(true);

        await request(app)
            .post("/api/notifications")
            .set("X-Internal-Token", internalToken)
            .send({
                userId: account.id,
                title: "Request Money",
                body: "User requested Rs. 200",
                type: "REQUEST_MONEY",
                data: {
                    amount: 200,
                },
            })
            .expect(201);

        const listUndo = await request(app)
            .get("/api/notifications?type=UNDO_REQUEST")
            .set("Authorization", `Bearer ${account.token}`);

        expect(listUndo.statusCode).toBe(200);
        expect(listUndo.body.success).toBe(true);
        expect(listUndo.body.data.items.length).toBe(1);

        const undoId = listUndo.body.data.items[0].id as string;

        const markRead = await request(app)
            .patch(`/api/notifications/${undoId}/read`)
            .set("Authorization", `Bearer ${account.token}`);

        expect(markRead.statusCode).toBe(200);
        expect(markRead.body.data.isRead).toBe(true);

        const unreadUndo = await request(app)
            .get("/api/notifications?type=UNDO_REQUEST&isRead=false")
            .set("Authorization", `Bearer ${account.token}`);

        expect(unreadUndo.statusCode).toBe(200);
        expect(unreadUndo.body.data.total).toBe(0);

        const markAll = await request(app)
            .patch("/api/notifications/read-all")
            .set("Authorization", `Bearer ${account.token}`);

        expect(markAll.statusCode).toBe(200);
        expect(markAll.body.success).toBe(true);

        const unreadAny = await request(app)
            .get("/api/notifications?isRead=false")
            .set("Authorization", `Bearer ${account.token}`);

        expect(unreadAny.statusCode).toBe(200);
        expect(unreadAny.body.data.total).toBe(0);
    });

    test("transfer success creates sender and receiver notifications", async () => {
        const sender = await registerAndLogin("sender");
        const receiver = await registerAndLogin("receiver");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        const transferRes = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 125,
                remark: "notify transfer",
                pin: "1234",
            });

        expect(transferRes.statusCode).toBe(200);

        const txId = transferRes.body.data.receipt.txId as string;

        const senderNotifications = await request(app)
            .get("/api/notifications?type=PAYMENT_SUCCESS")
            .set("Authorization", `Bearer ${sender.token}`);

        expect(senderNotifications.statusCode).toBe(200);
        const senderMatch = senderNotifications.body.data.items.find((item: any) => {
            return item?.data?.txId === txId && item?.data?.direction === "DEBIT";
        });
        expect(senderMatch).toBeDefined();

        const receiverNotifications = await request(app)
            .get("/api/notifications?type=PAYMENT_SUCCESS")
            .set("Authorization", `Bearer ${receiver.token}`);

        expect(receiverNotifications.statusCode).toBe(200);
        const receiverMatch = receiverNotifications.body.data.items.find((item: any) => {
            return item?.data?.txId === txId && item?.data?.direction === "CREDIT";
        });
        expect(receiverMatch).toBeDefined();
    });

    test("money request notifications include lifecycle action payload", async () => {
        const requester = await registerAndLogin("mr-requester");
        const receiver = await registerAndLogin("mr-receiver");

        const createRequestRes = await request(app)
            .post("/api/money-requests")
            .set("Authorization", `Bearer ${requester.token}`)
            .send({
                toPhoneNumber: receiver.user.phoneNumber,
                amount: 90,
            });

        expect(createRequestRes.statusCode).toBe(201);
        const moneyRequestId = createRequestRes.body.data.id as string;

        const receiverNotifications = await request(app)
            .get("/api/notifications?type=REQUEST_MONEY")
            .set("Authorization", `Bearer ${receiver.token}`);

        const createdMatch = receiverNotifications.body.data.items.find((item: any) => {
            return item?.data?.moneyRequestId === moneyRequestId && item?.data?.action === "CREATED";
        });
        expect(createdMatch).toBeDefined();

        await request(app)
            .post(`/api/money-requests/${moneyRequestId}/reject`)
            .set("Authorization", `Bearer ${receiver.token}`)
            .send({})
            .expect(200);

        const requesterNotifications = await request(app)
            .get("/api/notifications?type=REQUEST_MONEY")
            .set("Authorization", `Bearer ${requester.token}`);

        const rejectedMatch = requesterNotifications.body.data.items.find((item: any) => {
            return item?.data?.moneyRequestId === moneyRequestId && item?.data?.action === "REJECTED";
        });
        expect(rejectedMatch).toBeDefined();
    });
});

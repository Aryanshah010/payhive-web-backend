import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";

const prefix = "itest-tx+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);
    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });
    return { user, token: loginRes.body.token, id: loginRes.body.data._id };
};

describe("Transaction Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("beneficiary lookup success", async () => {
        const sender = await registerAndLogin("sender-lookup");
        const recipient = await registerAndLogin("recipient-lookup");

        const res = await request(app)
            .get(`/api/transactions/beneficiary?phoneNumber=${recipient.user.phoneNumber}`)
            .set("Authorization", `Bearer ${sender.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.phoneNumber).toBe(recipient.user.phoneNumber);
    });

    test("beneficiary lookup to self returns 400", async () => {
        const sender = await registerAndLogin("sender-self");

        const res = await request(app)
            .get(`/api/transactions/beneficiary?phoneNumber=${sender.user.phoneNumber}`)
            .set("Authorization", `Bearer ${sender.token}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("preview transfer success", async () => {
        const sender = await registerAndLogin("sender-preview");
        const recipient = await registerAndLogin("recipient-preview");

        const res = await request(app)
            .post("/api/transactions/preview")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 50,
                remark: "Test preview",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("preview transfer invalid amount", async () => {
        const sender = await registerAndLogin("sender-preview-invalid");
        const recipient = await registerAndLogin("recipient-preview-invalid");

        const res = await request(app)
            .post("/api/transactions/preview")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: -1,
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("confirm transfer success", async () => {
        const sender = await registerAndLogin("sender-confirm");
        const recipient = await registerAndLogin("recipient-confirm");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        const res = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 100,
                remark: "Integration test",
                pin: "1234",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        const updatedSender = await UserModel.findById(sender.id);
        const updatedRecipient = await UserModel.findOne({
            phoneNumber: recipient.user.phoneNumber,
        });

        expect(updatedSender?.balance).toBe(900);
        expect(updatedRecipient?.balance).toBe(100);
    });

    test("confirm transfer invalid PIN", async () => {
        const sender = await registerAndLogin("sender-bad-pin");
        const recipient = await registerAndLogin("recipient-bad-pin");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        const res = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 100,
                remark: "Integration test",
                pin: "0000",
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test("confirm transfer insufficient balance", async () => {
        const sender = await registerAndLogin("sender-low-balance");
        const recipient = await registerAndLogin("recipient-low-balance");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 50 });

        const res = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 100,
                remark: "Integration test",
                pin: "1234",
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("history returns items with pagination", async () => {
        const sender = await registerAndLogin("sender-history");
        const recipient = await registerAndLogin("recipient-history");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 100,
                remark: "Integration test",
                pin: "1234",
            })
            .expect(200);

        const res = await request(app)
            .get("/api/transactions?page=1&limit=5")
            .set("Authorization", `Bearer ${sender.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    test("get transaction by txId success", async () => {
        const sender = await registerAndLogin("sender-txid");
        const recipient = await registerAndLogin("recipient-txid");

        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({ pin: "1234" })
            .expect(200);

        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        const confirmRes = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                toPhoneNumber: recipient.user.phoneNumber,
                amount: 100,
                remark: "Integration test",
                pin: "1234",
            })
            .expect(200);

        const txId = confirmRes.body.data.receipt.txId;
        const res = await request(app)
            .get(`/api/transactions/${txId}`)
            .set("Authorization", `Bearer ${sender.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.txId).toBe(txId);
    });
});

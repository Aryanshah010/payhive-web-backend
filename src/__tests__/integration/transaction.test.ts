import request from "supertest";
import app from "../../app";
import { UserModel } from "../../models/user.model";

describe("POST /api/transactions/confirm - integration", () => {
    const sender = {
        fullName: "Sender User",
        phoneNumber: "5555555555",
        password: "Password@123",
    };

    const recipient = {
        fullName: "Recipient User",
        phoneNumber: "6666666666",
        password: "Password@123",
    };

    let senderToken: string;
    let senderId: string;

    beforeAll(async () => {
        // Register sender
        await request(app)
            .post("/api/auth/register")
            .send(sender)
            .expect(201);

        // Login sender and get JWT + user id
        const loginRes = await request(app)
            .post("/api/auth/login")
            .send({
                phoneNumber: sender.phoneNumber,
                password: sender.password,
            })
            .expect(200);

        senderToken = loginRes.body.token;
        senderId = loginRes.body.data._id;

        // Set PIN for sender
        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${senderToken}`)
            .send({ pin: "1234" })
            .expect(200);

        // Give sender some initial balance
        await UserModel.findByIdAndUpdate(senderId, { balance: 1000 });

        // Register recipient
        await request(app)
            .post("/api/auth/register")
            .send(recipient)
            .expect(201);
    });

    test("should successfully transfer when PIN and limits are valid", async () => {
        const amount = 100;

        const res = await request(app)
            .post("/api/transactions/confirm")
            .set("Authorization", `Bearer ${senderToken}`)
            .send({
                toPhoneNumber: recipient.phoneNumber,
                amount,
                remark: "Integration test transfer",
                pin: "1234",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.receipt).toBeDefined();
        expect(res.body.data.receipt.amount).toBe(amount);

        const updatedSender = await UserModel.findById(senderId);
        const updatedRecipient = await UserModel.findOne({
            phoneNumber: recipient.phoneNumber,
        });

        expect(updatedSender).not.toBeNull();
        expect(updatedRecipient).not.toBeNull();

        expect(updatedSender!.balance).toBe(1000 - amount);
        expect(updatedRecipient!.balance).toBe(amount);
    });
});


import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { sendEmail } from "../../configs/email";

jest.mock("../../configs/email", () => ({
    sendEmail: jest.fn(),
}));

const prefix = "itest-reset+";
const mockedSendEmail = sendEmail as jest.Mock;

describe("Password Reset Integration", () => {
    beforeEach(async () => {
        mockedSendEmail.mockClear();
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("request reset returns token and sends email", async () => {
        const user = makeUser(prefix, "request");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const res = await request(app)
            .post("/api/auth/request-password-reset")
            .send({ email: user.email });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.data).toBeDefined();

        expect(mockedSendEmail).toHaveBeenCalledTimes(1);
        const [to, subject, html] = mockedSendEmail.mock.calls[0];
        expect(to).toBe(user.email);
        expect(subject).toBe("Password Reset");
        expect(html).toContain("/reset-password?token=");
    });

    test("request reset with unknown email returns 404", async () => {
        const res = await request(app)
            .post("/api/auth/request-password-reset")
            .send({ email: "unknown@example.com" });

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
        expect(mockedSendEmail).not.toHaveBeenCalled();
    });

    test("reset password success then login with new password", async () => {
        const user = makeUser(prefix, "reset-success");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const resetRes = await request(app)
            .post("/api/auth/request-password-reset")
            .send({ email: user.email });

        const token = resetRes.body.token;
        expect(token).toBeDefined();

        const newPassword = "NewPass@123";
        const resetConfirm = await request(app)
            .post(`/api/auth/reset-password/${token}`)
            .send({ newPassword });

        expect(resetConfirm.statusCode).toBe(200);
        expect(resetConfirm.body.success).toBe(true);

        const loginRes = await request(app).post("/api/auth/login").send({
            phoneNumber: user.phoneNumber,
            password: newPassword,
        });

        expect(loginRes.statusCode).toBe(200);
        expect(loginRes.body.token).toBeDefined();
    });

    test("reset password with invalid token returns 400", async () => {
        const res = await request(app)
            .post("/api/auth/reset-password/invalid-token")
            .send({ newPassword: "NewPass@123" });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";

const prefix = "itest-user+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);
    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });
    return { user, token: loginRes.body.token };
};

describe("User Profile & PIN Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("/api/auth/me returns profile", async () => {
        const { user, token } = await registerAndLogin("me");

        const res = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.email).toBe(user.email);
    });

    test("update profile invalid fullName", async () => {
        const { token } = await registerAndLogin("bad-name");
        const res = await request(app)
            .put("/api/profile/updateProfile")
            .set("Authorization", `Bearer ${token}`)
            .send({ fullName: "ab" });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("update profile success", async () => {
        const { token } = await registerAndLogin("update");
        const res = await request(app)
            .put("/api/profile/updateProfile")
            .set("Authorization", `Bearer ${token}`)
            .send({ fullName: "Updated User" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("set PIN success", async () => {
        const { token } = await registerAndLogin("pin");
        const res = await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${token}`)
            .send({ pin: "1234" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("verify PIN wrong returns 401", async () => {
        const { token } = await registerAndLogin("verify-wrong");
        await request(app)
            .put("/api/profile/pin")
            .set("Authorization", `Bearer ${token}`)
            .send({ pin: "1234" })
            .expect(200);

        const res = await request(app)
            .post("/api/profile/verify-pin")
            .set("Authorization", `Bearer ${token}`)
            .send({ pin: "0000" });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });
});

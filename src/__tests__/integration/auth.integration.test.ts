import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";

const prefix = "itest-auth+";

describe("Auth Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("register fails when email missing", async () => {
        const user = makeUser(prefix, "missing-email");
        const res = await request(app).post("/api/auth/register").send({
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            password: user.password,
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("register fails when email invalid", async () => {
        const user = makeUser(prefix, "invalid-email");
        const res = await request(app).post("/api/auth/register").send({
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: "not-an-email",
            password: user.password,
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("register fails when weak password", async () => {
        const user = makeUser(prefix, "weak-pass");
        const res = await request(app).post("/api/auth/register").send({
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            password: "password",
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("register success", async () => {
        const user = makeUser(prefix, "success");
        const res = await request(app).post("/api/auth/register").send(user);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test("register duplicate phone", async () => {
        const user = makeUser(prefix, "dup-phone");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const user2 = makeUser(prefix, "dup-phone-2");
        const res = await request(app).post("/api/auth/register").send({
            ...user2,
            phoneNumber: user.phoneNumber,
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.success).toBe(false);
    });

    test("register duplicate email", async () => {
        const user = makeUser(prefix, "dup-email");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const user2 = makeUser(prefix, "dup-email-2");
        const res = await request(app).post("/api/auth/register").send({
            ...user2,
            email: user.email,
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.success).toBe(false);
    });

    test("login success", async () => {
        const user = makeUser(prefix, "login");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const res = await request(app).post("/api/auth/login").send({
            phoneNumber: user.phoneNumber,
            password: user.password,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
    });

    test("login invalid password", async () => {
        const user = makeUser(prefix, "login-invalid");
        await request(app).post("/api/auth/register").send(user).expect(201);

        const res = await request(app).post("/api/auth/login").send({
            phoneNumber: user.phoneNumber,
            password: "WrongPass@123",
        });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });
});

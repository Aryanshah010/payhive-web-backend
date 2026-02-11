import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";

const prefix = "itest-admin+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);
    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });
    return { user, token: loginRes.body.token, id: loginRes.body.data._id };
};

const promoteToAdmin = async (userId: string) => {
    await UserModel.findByIdAndUpdate(userId, { role: "admin" });
};

describe("Admin CRUD Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("non-admin access returns 403", async () => {
        const normalUser = await registerAndLogin("non-admin");
        const res = await request(app)
            .get("/api/admin/users")
            .set("Authorization", `Bearer ${normalUser.token}`);

        expect(res.statusCode).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test("admin create user success", async () => {
        const adminUser = await registerAndLogin("admin-create");
        await promoteToAdmin(adminUser.id);

        const newUser = makeUser(prefix, "created-user");
        const res = await request(app)
            .post("/api/admin/users")
            .set("Authorization", `Bearer ${adminUser.token}`)
            .send(newUser);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test("admin update user success", async () => {
        const adminUser = await registerAndLogin("admin-update");
        await promoteToAdmin(adminUser.id);

        const targetUser = makeUser(prefix, "update-target");
        const createRes = await request(app)
            .post("/api/auth/register")
            .send(targetUser)
            .expect(201);

        const targetId = createRes.body.data._id;
        const res = await request(app)
            .put(`/api/admin/users/${targetId}`)
            .set("Authorization", `Bearer ${adminUser.token}`)
            .send({ fullName: "Updated By Admin" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("admin delete user success", async () => {
        const adminUser = await registerAndLogin("admin-delete");
        await promoteToAdmin(adminUser.id);

        const targetUser = makeUser(prefix, "delete-target");
        const createRes = await request(app)
            .post("/api/auth/register")
            .send(targetUser)
            .expect(201);

        const targetId = createRes.body.data._id;
        const res = await request(app)
            .delete(`/api/admin/users/${targetId}`)
            .set("Authorization", `Bearer ${adminUser.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

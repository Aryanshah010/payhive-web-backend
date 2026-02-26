import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";

const prefix = "itest-fee+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);

    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });

    return {
        id: loginRes.body.data._id,
        token: loginRes.body.token,
        user,
    };
};

const promoteToAdmin = async (userId: string) => {
    await UserModel.findByIdAndUpdate(userId, { role: "admin" });
};

describe("Fee Configs Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("admin CRUD and overlap prevention", async () => {
        const admin = await registerAndLogin("admin-fee");
        await promoteToAdmin(admin.id);

        const createRes = await request(app)
            .post("/api/admin/fee-configs")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({
                type: "service_payment",
                description: `${prefix} flight fee`,
                calculation: { mode: "fixed", fixedAmount: 20 },
                appliesTo: ["flight"],
                isActive: true,
            });

        expect(createRes.statusCode).toBe(201);
        const configId = createRes.body.data._id;

        const listRes = await request(app)
            .get("/api/admin/fee-configs?page=1&limit=10")
            .set("Authorization", `Bearer ${admin.token}`);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.data.items.length).toBeGreaterThan(0);

        const getRes = await request(app)
            .get(`/api/admin/fee-configs/${configId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.data._id).toBe(configId);

        const updateRes = await request(app)
            .put(`/api/admin/fee-configs/${configId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ calculation: { mode: "fixed", fixedAmount: 25 } });

        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.data.calculation.fixedAmount).toBe(25);

        const overlapRes = await request(app)
            .post("/api/admin/fee-configs")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({
                type: "service_payment",
                description: `${prefix} overlap`,
                calculation: { mode: "fixed", fixedAmount: 15 },
                appliesTo: ["flight", "hotel"],
                isActive: true,
            });

        expect(overlapRes.statusCode).toBe(409);
        expect(overlapRes.body.code).toBe("FEE_CONFIG_OVERLAP");

        const deleteRes = await request(app)
            .delete(`/api/admin/fee-configs/${configId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(deleteRes.statusCode).toBe(204);
    });
});

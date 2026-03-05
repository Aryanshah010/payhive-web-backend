import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";
import { FeeConfigModel } from "../../models/fee-config.model";

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

const allAppliesTo = ["flight", "hotel", "internet", "topup", "recharge"];

const normalizeAppliesTo = (values: string[]) => {
    const normalized = new Set<string>();
    for (const value of values) {
        if (value === "topup" || value === "recharge") {
            normalized.add("topup");
            normalized.add("recharge");
            continue;
        }
        normalized.add(value);
    }
    return normalized;
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

        const occupied = new Set<string>();
        const existingActive = await FeeConfigModel.find({
            type: "service_payment",
            isActive: true,
        })
            .select({ appliesTo: 1 })
            .lean();

        for (const item of existingActive) {
            const itemAppliesTo = normalizeAppliesTo(item.appliesTo || []);
            for (const value of itemAppliesTo) {
                occupied.add(value);
            }
        }

        const freeAppliesTo = allAppliesTo.find((value) => !occupied.has(value));
        const createAsActive = Boolean(freeAppliesTo);
        const createAppliesTo = [freeAppliesTo || "flight"];

        const createRes = await request(app)
            .post("/api/admin/fee-configs")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({
                type: "service_payment",
                description: `${prefix} flight fee`,
                calculation: { mode: "fixed", fixedAmount: 20 },
                appliesTo: createAppliesTo,
                isActive: createAsActive,
            });

        expect(createRes.statusCode).toBe(201);
        const configId = createRes.body.data._id;
        let configIsActive = Boolean(createRes.body.data.isActive);

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

        let updateRes = await request(app)
            .put(`/api/admin/fee-configs/${configId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ calculation: { mode: "fixed", fixedAmount: 25 }, isActive: configIsActive });

        if (updateRes.statusCode === 409) {
            expect(updateRes.body.code).toBe("FEE_CONFIG_OVERLAP");

            const deactivateRes = await request(app)
                .put(`/api/admin/fee-configs/${configId}`)
                .set("Authorization", `Bearer ${admin.token}`)
                .send({ isActive: false });

            expect(deactivateRes.statusCode).toBe(200);
            configIsActive = false;

            updateRes = await request(app)
                .put(`/api/admin/fee-configs/${configId}`)
                .set("Authorization", `Bearer ${admin.token}`)
                .send({ calculation: { mode: "fixed", fixedAmount: 25 }, isActive: false });
        }

        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.data.calculation.fixedAmount).toBe(25);

        if (configIsActive) {
            const overlapRes = await request(app)
                .post("/api/admin/fee-configs")
                .set("Authorization", `Bearer ${admin.token}`)
                .send({
                    type: "service_payment",
                    description: `${prefix} overlap`,
                    calculation: { mode: "fixed", fixedAmount: 15 },
                    appliesTo: createAppliesTo,
                    isActive: true,
                });

            expect(overlapRes.statusCode).toBe(409);
            expect(overlapRes.body.code).toBe("FEE_CONFIG_OVERLAP");
        } else {
            const activateRes = await request(app)
                .put(`/api/admin/fee-configs/${configId}`)
                .set("Authorization", `Bearer ${admin.token}`)
                .send({ isActive: true });

            expect(activateRes.statusCode).toBe(409);
            expect(activateRes.body.code).toBe("FEE_CONFIG_OVERLAP");
        }

        const deleteRes = await request(app)
            .delete(`/api/admin/fee-configs/${configId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(deleteRes.statusCode).toBe(204);
    });
});

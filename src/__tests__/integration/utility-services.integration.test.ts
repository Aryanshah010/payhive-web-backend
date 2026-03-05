import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { TransactionModel } from "../../models/transaction.model";
import { UserModel } from "../../models/user.model";
import * as configs from "../../configs";

const prefix = "itest-util+";

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

const createOrResolveFeeConfig = async (token: string, appliesTo: string[], fixedAmount: number) => {
    const createRes = await request(app)
        .post("/api/admin/fee-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({
            type: "service_payment",
            description: `${prefix} fee ${appliesTo.join("-")}`,
            calculation: { mode: "fixed", fixedAmount },
            appliesTo,
            isActive: true,
        });

    if (createRes.statusCode === 201) {
        return createRes.body.data.calculation.fixedAmount as number;
    }

    if (createRes.statusCode === 409 && createRes.body?.code === "FEE_CONFIG_OVERLAP") {
        const listRes = await request(app)
            .get("/api/admin/fee-configs?page=1&limit=50&type=service_payment&isActive=true")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        const requested = normalizeAppliesTo(appliesTo);
        const overlapping = (listRes.body.data.items || []).find((item: any) => {
            const itemAppliesTo = normalizeAppliesTo(item.appliesTo || []);
            for (const value of itemAppliesTo) {
                if (requested.has(value)) {
                    return true;
                }
            }
            return false;
        });

        if (!overlapping) {
            throw new Error("Fee config overlap reported but no overlapping active config found");
        }

        return overlapping.calculation.fixedAmount as number;
    }

    throw new Error(`Unexpected fee config response: ${createRes.statusCode}`);
};

const makeInternetPayload = (tag: string, overrides: Record<string, unknown> = {}) => ({
    provider: `${prefix}ISP-${tag}`,
    name: `${prefix}Internet-${tag}`,
    packageLabel: "Monthly",
    amount: 899,
    validationRegex: "^[A-Z0-9]{6,12}$",
    isActive: true,
    meta: { segment: "home" },
    ...overrides,
});

const makeTopupPayload = (tag: string, overrides: Record<string, unknown> = {}) => ({
    provider: `${prefix}Carrier-${tag}`,
    name: `${prefix}Topup-${tag}`,
    packageLabel: "28 Days",
    amount: 399,
    validationRegex: "^[0-9]{10}$",
    isActive: true,
    meta: { segment: "mobile" },
    ...overrides,
});

describe("Utility Services Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("admin CRUD for internet and topup services", async () => {
        const admin = await registerAndLogin("admin-crud");
        await promoteToAdmin(admin.id);

        const createInternetRes = await request(app)
            .post("/api/admin/internet-services")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeInternetPayload("crud"));

        expect(createInternetRes.statusCode).toBe(201);
        const internetId = createInternetRes.body.data._id;

        const listInternetRes = await request(app)
            .get("/api/admin/internet-services?page=1&limit=10")
            .set("Authorization", `Bearer ${admin.token}`);

        expect(listInternetRes.statusCode).toBe(200);
        expect(listInternetRes.body.data.items.length).toBeGreaterThan(0);

        const updateInternetRes = await request(app)
            .put(`/api/admin/internet-services/${internetId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ amount: 999 });

        expect(updateInternetRes.statusCode).toBe(200);
        expect(updateInternetRes.body.data.amount).toBe(999);

        const deleteInternetRes = await request(app)
            .delete(`/api/admin/internet-services/${internetId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(deleteInternetRes.statusCode).toBe(204);

        const createTopupRes = await request(app)
            .post("/api/admin/topup-services")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeTopupPayload("crud"));

        expect(createTopupRes.statusCode).toBe(201);
        const topupId = createTopupRes.body.data._id;

        const getTopupRes = await request(app)
            .get(`/api/admin/topup-services/${topupId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(getTopupRes.statusCode).toBe(200);

        const updateTopupRes = await request(app)
            .put(`/api/admin/topup-services/${topupId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ amount: 449 });

        expect(updateTopupRes.statusCode).toBe(200);
        expect(updateTopupRes.body.data.amount).toBe(449);

        const deleteTopupRes = await request(app)
            .delete(`/api/admin/topup-services/${topupId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(deleteTopupRes.statusCode).toBe(204);
    });

    test("public list/detail for internet and topup", async () => {
        const admin = await registerAndLogin("admin-public");
        await promoteToAdmin(admin.id);

        const internetRes = await request(app)
            .post("/api/admin/internet-services")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeInternetPayload("public"))
            .expect(201);

        const topupRes = await request(app)
            .post("/api/admin/topup-services")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeTopupPayload("public"))
            .expect(201);

        const listInternet = await request(app).get("/api/internet-services?page=1&limit=10");
        expect(listInternet.statusCode).toBe(200);
        expect(listInternet.body.data.items.some((item: any) => item._id === internetRes.body.data._id)).toBe(true);

        const detailInternet = await request(app).get(`/api/internet-services/${internetRes.body.data._id}`);
        expect(detailInternet.statusCode).toBe(200);

        const listTopup = await request(app).get("/api/topup-services?page=1&limit=10");
        expect(listTopup.statusCode).toBe(200);
        expect(listTopup.body.data.items.some((item: any) => item._id === topupRes.body.data._id)).toBe(true);

        const detailTopup = await request(app).get(`/api/topup-services/${topupRes.body.data._id}`);
        expect(detailTopup.statusCode).toBe(200);
    });

    test("internet payment success + idempotency replay + history meta", async () => {
        const originalRevenueUserId = (configs as any).PLATFORM_REVENUE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-int-pay");
            await promoteToAdmin(admin.id);

            const revenue = await registerAndLogin("revenue-int-pay");
            await promoteToAdmin(revenue.id);
            (configs as any).PLATFORM_REVENUE_USER_ID = revenue.id;

            const user = await registerAndLogin("user-int-pay");

            const feeAmount = await createOrResolveFeeConfig(admin.token, ["internet"], 5);
            const serviceAmount = 1200;
            const totalDebited = serviceAmount + feeAmount;
            const initialBalance = totalDebited + 3795;
            await UserModel.findByIdAndUpdate(user.id, { balance: initialBalance });

            const createInternetRes = await request(app)
                .post("/api/admin/internet-services")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(makeInternetPayload("pay", { amount: serviceAmount }))
                .expect(201);

            const serviceId = createInternetRes.body.data._id;

            const firstPayRes = await request(app)
                .post(`/api/internet-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .set("Idempotency-Key", "int-pay-1")
                .send({ customerId: "ABCD1234" });

            expect(firstPayRes.statusCode).toBe(200);
            expect(firstPayRes.body.data.receipt.serviceType).toBe("internet");
            expect(firstPayRes.body.data.receipt.fee).toBe(feeAmount);
            expect(firstPayRes.body.data.receipt.totalDebited).toBe(totalDebited);

            const secondPayRes = await request(app)
                .post(`/api/internet-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .set("Idempotency-Key", "int-pay-1")
                .send({ customerId: "ABCD1234" });

            expect(secondPayRes.statusCode).toBe(200);
            expect(secondPayRes.body.data.idempotentReplay).toBe(true);
            expect(secondPayRes.body.data.transactionId).toBe(firstPayRes.body.data.transactionId);

            const userAfter = await UserModel.findById(user.id);
            expect(userAfter?.balance).toBe(initialBalance - totalDebited);

            const historyRes = await request(app)
                .get("/api/transactions?page=1&limit=20")
                .set("Authorization", `Bearer ${user.token}`);

            expect(historyRes.statusCode).toBe(200);
            const utilityItem = historyRes.body.data.items.find((item: any) => item.paymentType === "UTILITY_PAYMENT");
            expect(utilityItem).toBeTruthy();
            expect(utilityItem.meta.serviceType).toBe("internet");
            expect(utilityItem.meta.fee).toBe(feeAmount);
            expect(utilityItem.meta.totalDebited).toBe(totalDebited);

            const txDetailRes = await request(app)
                .get(`/api/transactions/${firstPayRes.body.data.receipt.receiptNo}`)
                .set("Authorization", `Bearer ${user.token}`);

            expect(txDetailRes.statusCode).toBe(200);
            expect(txDetailRes.body.data.paymentType).toBe("UTILITY_PAYMENT");
            expect(txDetailRes.body.data.meta.serviceType).toBe("internet");
            expect(txDetailRes.body.data.meta.fee).toBe(feeAmount);
        } finally {
            (configs as any).PLATFORM_REVENUE_USER_ID = originalRevenueUserId;
        }
    });

    test("utility payment fails when payee wallet resolves to payer wallet", async () => {
        const originalPayeeUserId = (configs as any).BOOKING_PAYEE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-util-payee-self");
            await promoteToAdmin(admin.id);
            await UserModel.findByIdAndUpdate(admin.id, { balance: 5000 });

            (configs as any).BOOKING_PAYEE_USER_ID = admin.id;

            const createInternetRes = await request(app)
                .post("/api/admin/internet-services")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(makeInternetPayload("payee-self", { amount: 1200 }))
                .expect(201);

            const serviceId = createInternetRes.body.data._id;
            const balanceBefore = (await UserModel.findById(admin.id))?.balance;

            const payRes = await request(app)
                .post(`/api/internet-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${admin.token}`)
                .send({ customerId: "ABCD1234" });

            expect(payRes.statusCode).toBe(500);
            expect(payRes.body.code).toBe("PAYEE_MISCONFIGURED");
            expect(payRes.body.message).toContain("BOOKING_PAYEE_USER_ID");

            const balanceAfter = (await UserModel.findById(admin.id))?.balance;
            expect(balanceAfter).toBe(balanceBefore);

            const paymentTx = await TransactionModel.findOne({
                from: admin.id,
                paymentType: "UTILITY_PAYMENT",
                "meta.serviceId": serviceId,
            });
            expect(paymentTx).toBeNull();
        } finally {
            (configs as any).BOOKING_PAYEE_USER_ID = originalPayeeUserId;
        }
    });

    test("topup payment success + validation failure + insufficient funds", async () => {
        const originalRevenueUserId = (configs as any).PLATFORM_REVENUE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-topup-pay");
            await promoteToAdmin(admin.id);

            const revenue = await registerAndLogin("revenue-topup-pay");
            await promoteToAdmin(revenue.id);
            (configs as any).PLATFORM_REVENUE_USER_ID = revenue.id;

            const user = await registerAndLogin("user-topup-pay");

            const feeAmount = await createOrResolveFeeConfig(admin.token, ["topup"], 5);
            const serviceAmount = 350;
            const totalDebited = serviceAmount + feeAmount;
            const lowBalance = Math.max(0, totalDebited - 1);
            await UserModel.findByIdAndUpdate(user.id, { balance: lowBalance });

            const createTopupRes = await request(app)
                .post("/api/admin/topup-services")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(makeTopupPayload("pay", { amount: serviceAmount }))
                .expect(201);

            const serviceId = createTopupRes.body.data._id;

            const invalidRes = await request(app)
                .post(`/api/topup-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .send({ phoneNumber: "123" });

            expect(invalidRes.statusCode).toBe(400);

            const insufficientRes = await request(app)
                .post(`/api/topup-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .send({ phoneNumber: "9876543210" });

            expect(insufficientRes.statusCode).toBe(402);
            expect(insufficientRes.body.code).toBe("INSUFFICIENT_FUNDS");

            const fundedBalance = totalDebited + 645;
            await UserModel.findByIdAndUpdate(user.id, { balance: fundedBalance });

            const successRes = await request(app)
                .post(`/api/topup-services/${serviceId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .send({ phoneNumber: "9876543210" });

            expect(successRes.statusCode).toBe(200);
            expect(successRes.body.data.receipt.serviceType).toBe("topup");
            expect(successRes.body.data.receipt.phoneMasked).toBeDefined();
            expect(successRes.body.data.receipt.fee).toBe(feeAmount);
            expect(successRes.body.data.receipt.totalDebited).toBe(totalDebited);

            const tx = await TransactionModel.findById(successRes.body.data.transactionId);
            expect(tx?.paymentType).toBe("UTILITY_PAYMENT");
            expect(tx?.amount).toBe(totalDebited);
            expect(tx?.meta?.fee).toBe(feeAmount);
        } finally {
            (configs as any).PLATFORM_REVENUE_USER_ID = originalRevenueUserId;
        }
    });
});

import crypto from "crypto";
import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { UserModel } from "../../models/user.model";
import { TransactionModel } from "../../models/transaction.model";
import { BankTransferModel } from "../../models/bank-transfer.model";
import * as configs from "../../configs";

const prefix = "itest-bank+";

let originalClearingAccountUserId = "";

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

const makeBankPayload = (tag: string, overrides: Record<string, unknown> = {}) => ({
    name: `${prefix} Bank ${tag}`,
    code: `BK${crypto.randomInt(100000, 999999)}`,
    accountNumberRegex: "^[0-9]{10,16}$",
    isActive: true,
    minTransfer: 100,
    maxTransfer: 50000,
    ...overrides,
});

describe("Bank Transfer Integration", () => {
    beforeEach(async () => {
        originalClearingAccountUserId = (configs as any).BANK_CLEARING_ACCOUNT_USER_ID;
        await cleanupTestData(prefix);
    });

    afterEach(async () => {
        (configs as any).BANK_CLEARING_ACCOUNT_USER_ID = originalClearingAccountUserId;
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("admin bank CRUD and non-admin protection", async () => {
        const nonAdmin = await registerAndLogin("non-admin");
        const forbiddenRes = await request(app)
            .get("/api/admin/banks")
            .set("Authorization", `Bearer ${nonAdmin.token}`);

        expect(forbiddenRes.statusCode).toBe(403);

        const admin = await registerAndLogin("admin-crud");
        await promoteToAdmin(admin.id);

        const createRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("crud"));

        expect(createRes.statusCode).toBe(201);
        expect(createRes.body.status).toBe("success");
        const bankId = createRes.body.data._id;

        const listRes = await request(app)
            .get("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.data.some((item: any) => item._id === bankId)).toBe(true);

        const updateRes = await request(app)
            .put(`/api/admin/banks/${bankId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ minTransfer: 200, maxTransfer: 60000 });

        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.data.minTransfer).toBe(200);

        const deleteRes = await request(app)
            .delete(`/api/admin/banks/${bankId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(deleteRes.statusCode).toBe(204);
    });

    test("admin bank validation errors", async () => {
        const admin = await registerAndLogin("admin-validate");
        await promoteToAdmin(admin.id);

        const invalidRegexRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("bad-regex", { accountNumberRegex: "[" }));

        expect(invalidRegexRes.statusCode).toBe(400);
        expect(invalidRegexRes.body.code).toBe("VALIDATION_ERROR");

        const invalidRangeRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("bad-range", { minTransfer: 5000, maxTransfer: 1000 }));

        expect(invalidRangeRes.statusCode).toBe(400);
        expect(invalidRangeRes.body.code).toBe("VALIDATION_ERROR");
    });

    test("public active bank list excludes inactive and exposes fixed fee", async () => {
        const admin = await registerAndLogin("admin-public");
        await promoteToAdmin(admin.id);

        await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("active", { isActive: true }))
            .expect(201);

        await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("inactive", { isActive: false }))
            .expect(201);

        const publicRes = await request(app).get("/api/banks");

        expect(publicRes.statusCode).toBe(200);
        expect(publicRes.body.status).toBe("success");
        expect(publicRes.body.data.length).toBeGreaterThan(0);
        expect(publicRes.body.data.every((item: any) => item.fee === 10)).toBe(true);
        expect(
            publicRes.body.data.every(
                (item: any) => !Object.prototype.hasOwnProperty.call(item, "accountNumberRegex")
            )
        ).toBe(true);
        expect(
            publicRes.body.data.every((item: any) => !Object.prototype.hasOwnProperty.call(item, "isActive"))
        ).toBe(true);
        expect(publicRes.body.data.some((item: any) => item.name.includes("inactive"))).toBe(false);
    });

    test("bank transfer validation and insufficient funds cases", async () => {
        const admin = await registerAndLogin("admin-transfer-validate");
        await promoteToAdmin(admin.id);

        const bankRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("transfer-validation"))
            .expect(201);

        const inactiveBankRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("transfer-inactive", { isActive: false }))
            .expect(201);

        const sender = await registerAndLogin("sender-validation");
        await UserModel.findByIdAndUpdate(sender.id, { balance: 105 });

        const clearing = await registerAndLogin("clearing-validation");
        (configs as any).BANK_CLEARING_ACCOUNT_USER_ID = clearing.id;

        const invalidBankRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: "invalid-id",
                accountNumber: "1234567890",
                amount: 200,
            });

        expect(invalidBankRes.statusCode).toBe(400);
        expect(invalidBankRes.body.code).toBe("INVALID_BANK");

        const inactiveBankTransferRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: inactiveBankRes.body.data._id,
                accountNumber: "1234567890",
                amount: 200,
            });

        expect(inactiveBankTransferRes.statusCode).toBe(400);
        expect(inactiveBankTransferRes.body.code).toBe("INVALID_BANK");

        const invalidAmountRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: bankRes.body.data._id,
                accountNumber: "1234567890",
                amount: 50,
            });

        expect(invalidAmountRes.statusCode).toBe(400);
        expect(invalidAmountRes.body.code).toBe("INVALID_AMOUNT");

        const invalidAccountRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: bankRes.body.data._id,
                accountNumber: "ABCD",
                amount: 100,
            });

        expect(invalidAccountRes.statusCode).toBe(400);
        expect(invalidAccountRes.body.code).toBe("INVALID_ACCOUNT_NUMBER");

        const insufficientRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: bankRes.body.data._id,
                accountNumber: "1234567890",
                amount: 100,
            });

        expect(insufficientRes.statusCode).toBe(402);
        expect(insufficientRes.body.code).toBe("INSUFFICIENT_FUNDS");
    });

    test("bank transfer success updates balances and transaction history", async () => {
        const admin = await registerAndLogin("admin-transfer-success");
        await promoteToAdmin(admin.id);

        const bankRes = await request(app)
            .post("/api/admin/banks")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(makeBankPayload("transfer-success"))
            .expect(201);

        (configs as any).BANK_CLEARING_ACCOUNT_USER_ID = admin.id;

        const sender = await registerAndLogin("sender-success");
        await UserModel.findByIdAndUpdate(sender.id, { balance: 1000 });

        const clearingBefore = await UserModel.findById(admin.id);

        const transferRes = await request(app)
            .post("/api/bank-transfers")
            .set("Authorization", `Bearer ${sender.token}`)
            .send({
                bankId: bankRes.body.data._id,
                accountNumber: "1234567890",
                amount: 200,
            });

        expect(transferRes.statusCode).toBe(200);
        expect(transferRes.body.status).toBe("success");
        expect(transferRes.body.data.fee).toBe(10);
        expect(transferRes.body.data.totalDebited).toBe(210);
        expect(transferRes.body.data.accountNumberMasked).toMatch(/\*+7890$/);

        const senderAfter = await UserModel.findById(sender.id);
        expect(senderAfter?.balance).toBe(790);

        const clearingAfter = await UserModel.findById(admin.id);
        const clearingBeforeBalance = clearingBefore?.balance || 0;
        expect(clearingAfter?.balance).toBe(clearingBeforeBalance + 210);

        const txDoc = await TransactionModel.findById(transferRes.body.data.transactionId);
        expect(txDoc).toBeTruthy();
        expect(txDoc?.paymentType).toBe("BANK_TRANSFER");
        expect(txDoc?.meta).toMatchObject({
            type: "bank_transfer",
            bankName: bankRes.body.data.name,
            fee: 10,
            status: "completed",
        });
        expect(JSON.stringify(txDoc?.meta || {})).not.toContain("1234567890");

        const bankTransferDoc = await BankTransferModel.findById(transferRes.body.data.transferId);
        expect(bankTransferDoc).toBeTruthy();
        expect(bankTransferDoc?.status).toBe("completed");
        expect(bankTransferDoc?.amount).toBe(200);
        expect(bankTransferDoc?.fee).toBe(10);
        expect(bankTransferDoc?.totalDebited).toBe(210);
        expect(bankTransferDoc?.accountNumberMasked).toContain("7890");
        expect(bankTransferDoc?.accountNumberMasked).not.toBe("1234567890");

        const historyRes = await request(app)
            .get("/api/transactions?page=1&limit=20")
            .set("Authorization", `Bearer ${sender.token}`);

        expect(historyRes.statusCode).toBe(200);
        const bankTransferItem = historyRes.body.data.items.find(
            (item: any) => item.paymentType === "BANK_TRANSFER"
        );
        expect(bankTransferItem).toBeTruthy();
        expect(bankTransferItem.type).toBe("bank_transfer");
        expect(bankTransferItem.bankName).toBe(bankRes.body.data.name);
        expect(bankTransferItem.maskedAccount).toContain("7890");
        expect(bankTransferItem.fee).toBe(10);
        expect(bankTransferItem.timestamp).toBeTruthy();
    });
});

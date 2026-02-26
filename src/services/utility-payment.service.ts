import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { BOOKING_PAYEE_USER_ID, PLATFORM_REVENUE_USER_ID } from "../configs";
import { HttpError } from "../errors/http-error";
import { ITransaction } from "../models/transaction.model";
import { IUser } from "../models/user.model";
import { UtilityType } from "../models/utility.model";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UserRepository } from "../repositories/user.repository";
import { UtilityRepository } from "../repositories/utility.repository";
import { FeeService } from "./fee.service";

let utilityRepository = new UtilityRepository();
let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();
let feeService = new FeeService();

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;

const isTransactionUnsupportedError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return (
        message.includes("transaction numbers are only allowed on a replica set member or mongos") ||
        message.includes("replica set") ||
        message.includes("transaction not supported")
    );
};

const maskValue = (value: string) => {
    if (value.length <= 4) {
        return "*".repeat(value.length);
    }
    return `${value.slice(0, 2)}${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
};

const buildKey = (type: UtilityType, serviceId: string, customerRef: string, idempotencyKey: string) =>
    `${type}-pay:${serviceId}:${customerRef}:${idempotencyKey}`;

interface UtilityPaymentResult {
    transactionId: string;
    receipt: Record<string, unknown>;
    idempotentReplay: boolean;
}

export class UtilityPaymentService {
    async payInternetService(
        userId: string,
        serviceId: string,
        customerId: string,
        rawIdempotencyKey?: string
    ): Promise<UtilityPaymentResult> {
        return this.payByType({
            userId,
            serviceId,
            type: "internet",
            customerRef: customerId.trim(),
            rawIdempotencyKey,
        });
    }

    async payTopupService(
        userId: string,
        serviceId: string,
        phoneNumber: string,
        rawIdempotencyKey?: string
    ): Promise<UtilityPaymentResult> {
        return this.payByType({
            userId,
            serviceId,
            type: "topup",
            customerRef: phoneNumber.trim(),
            rawIdempotencyKey,
        });
    }

    private async payByType({
        userId,
        serviceId,
        type,
        customerRef,
        rawIdempotencyKey,
    }: {
        userId: string;
        serviceId: string;
        type: UtilityType;
        customerRef: string;
        rawIdempotencyKey?: string;
    }): Promise<UtilityPaymentResult> {
        if (!customerRef) {
            throw new HttpError(400, "Customer reference is required", { code: "VALIDATION_ERROR" });
        }

        const service = await utilityRepository.getByIdAndType(serviceId, type);
        if (!service || !service.isActive) {
            throw new HttpError(404, "Service not found", { code: "NOT_FOUND" });
        }

        this.validateCustomerRef(type, customerRef, service.validationRegex || "");

        const amount = normalizeAmount(service.amount);
        const fee = await feeService.getFixedFee("service_payment", type === "topup" ? "topup" : type);
        const totalDebited = normalizeAmount(amount + fee);
        const idempotencyKey = rawIdempotencyKey?.trim();
        const namespacedKey = idempotencyKey ? buildKey(type, serviceId, customerRef, idempotencyKey) : undefined;

        if (namespacedKey) {
            const existingTx = await transactionRepository.getBySenderAndIdempotencyKey(userId, namespacedKey);
            if (existingTx) {
                const existingMeta = (existingTx.meta || {}) as Record<string, unknown>;
                if (
                    existingTx.paymentType !== "UTILITY_PAYMENT" ||
                    existingMeta.serviceType !== type ||
                    existingMeta.serviceId !== serviceId ||
                    existingMeta.customerRef !== customerRef
                ) {
                    throw new HttpError(409, "Idempotency key already used with different payload", {
                        code: "IDEMPOTENCY_CONFLICT",
                    });
                }

                return {
                    transactionId: existingTx._id.toString(),
                    receipt: (existingMeta.receipt as Record<string, unknown>) || {},
                    idempotentReplay: true,
                };
            }
        }

        const payee = await this.resolvePayee(userId);
        const revenueWallet = fee > 0 ? await this.resolveRevenueWallet(userId) : null;
        try {
            return await this.payWithTransaction({
                userId,
                payeeId: payee._id.toString(),
                revenueWalletId: revenueWallet?._id.toString(),
                serviceId,
                type,
                customerRef,
                amount,
                fee,
                totalDebited,
                provider: service.provider,
                planName: service.name,
                packageLabel: service.packageLabel || "",
                idempotencyKey: namespacedKey,
            });
        } catch (error: unknown) {
            if (!isTransactionUnsupportedError(error)) {
                throw error;
            }
            return this.payWithFallback({
                userId,
                payeeId: payee._id.toString(),
                revenueWalletId: revenueWallet?._id.toString(),
                serviceId,
                type,
                customerRef,
                amount,
                fee,
                totalDebited,
                provider: service.provider,
                planName: service.name,
                packageLabel: service.packageLabel || "",
                idempotencyKey: namespacedKey,
            });
        }
    }

    private validateCustomerRef(type: UtilityType, customerRef: string, validationRegex: string) {
        let validator: RegExp;
        if (validationRegex.trim().length > 0) {
            try {
                validator = new RegExp(validationRegex);
            } catch {
                throw new HttpError(500, "Service configuration invalid", { code: "SERVICE_CONFIG_ERROR" });
            }
        } else {
            validator = type === "internet" ? /^[a-zA-Z0-9._-]{4,30}$/ : /^[0-9]{10}$/;
        }

        if (!validator.test(customerRef)) {
            throw new HttpError(400, "Invalid customer reference format", { code: "VALIDATION_ERROR" });
        }
    }

    private async resolvePayee(userId: string) {
        let payee: IUser | null = null;
        if (BOOKING_PAYEE_USER_ID) {
            const configuredPayee = await userRepository.getUserById(BOOKING_PAYEE_USER_ID);
            if (configuredPayee) {
                payee = configuredPayee;
            }
        }

        if (!payee) {
            payee = await userRepository.getFirstAdminUser();
        }

        if (!payee) {
            throw new HttpError(500, "Utility payee wallet not configured", {
                code: "PAYEE_NOT_CONFIGURED",
            });
        }

        if (payee._id.toString() === userId) {
            throw new HttpError(
                500,
                "Utility payee wallet cannot be the same as payer wallet. Configure BOOKING_PAYEE_USER_ID to a different user.",
                { code: "PAYEE_MISCONFIGURED" }
            );
        }

        return payee;
    }

    private async resolveRevenueWallet(userId: string) {
        let revenueWallet: IUser | null = null;
        if (PLATFORM_REVENUE_USER_ID) {
            const configuredRevenue = await userRepository.getUserById(PLATFORM_REVENUE_USER_ID);
            if (configuredRevenue) {
                revenueWallet = configuredRevenue;
            }
        }

        if (!revenueWallet) {
            revenueWallet = await userRepository.getFirstAdminUser();
        }

        if (!revenueWallet) {
            throw new HttpError(500, "Platform revenue wallet not configured", {
                code: "REVENUE_NOT_CONFIGURED",
            });
        }

        if (revenueWallet._id.toString() === userId) {
            throw new HttpError(
                500,
                "Platform revenue wallet cannot be the same as payer wallet. Configure PLATFORM_REVENUE_USER_ID to a different user.",
                { code: "REVENUE_MISCONFIGURED" }
            );
        }

        return revenueWallet;
    }

    private buildReceipt({
        type,
        serviceId,
        provider,
        planName,
        packageLabel,
        customerRef,
        amount,
        fee,
        totalDebited,
        txId,
        createdAt,
    }: {
        type: UtilityType;
        serviceId: string;
        provider: string;
        planName: string;
        packageLabel: string;
        customerRef: string;
        amount: number;
        fee: number;
        totalDebited: number;
        txId: string;
        createdAt: Date;
    }) {
        if (type === "internet") {
            return {
                receiptNo: txId,
                serviceType: type,
                serviceId,
                provider,
                planName,
                customerIdMasked: maskValue(customerRef),
                amount,
                fee,
                totalDebited,
                createdAt,
            };
        }

        return {
            receiptNo: txId,
            serviceType: type,
            serviceId,
            carrier: provider,
            packageLabel,
            phoneMasked: maskValue(customerRef),
            amount,
            fee,
            totalDebited,
            createdAt,
        };
    }

    private async payWithTransaction({
        userId,
        payeeId,
        revenueWalletId,
        serviceId,
        type,
        customerRef,
        amount,
        fee,
        totalDebited,
        provider,
        planName,
        packageLabel,
        idempotencyKey,
    }: {
        userId: string;
        payeeId: string;
        revenueWalletId?: string;
        serviceId: string;
        type: UtilityType;
        customerRef: string;
        amount: number;
        fee: number;
        totalDebited: number;
        provider: string;
        planName: string;
        packageLabel: string;
        idempotencyKey?: string;
    }): Promise<UtilityPaymentResult> {
        const session = await mongoose.startSession();
        let tx: ITransaction | null = null;
        let receipt: Record<string, unknown> | null = null;
        let transactionId: string | null = null;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(userId, totalDebited, session);
                if (!debited) {
                    throw new HttpError(402, "Top up your wallet", { code: "INSUFFICIENT_FUNDS" });
                }

                const credited = await userRepository.creditUser(payeeId, amount, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit payee wallet");
                }

                if (fee > 0 && revenueWalletId) {
                    const revenueCredited = await userRepository.creditUser(revenueWalletId, fee, session);
                    if (!revenueCredited) {
                        throw new HttpError(500, "Failed to credit revenue wallet");
                    }
                }

                const txId = uuidv4();
                receipt = this.buildReceipt({
                    type,
                    serviceId,
                    provider,
                    planName,
                    packageLabel,
                    customerRef,
                    amount,
                    fee,
                    totalDebited,
                    txId,
                    createdAt: new Date(),
                });

                tx = await transactionRepository.createTransaction(
                    {
                        from: new mongoose.Types.ObjectId(userId),
                        to: new mongoose.Types.ObjectId(payeeId),
                        amount: totalDebited,
                        remark: `${type} payment`,
                        status: "SUCCESS",
                        txId,
                        paymentType: "UTILITY_PAYMENT",
                        meta: {
                            serviceType: type,
                            serviceId,
                            customerRef,
                            provider,
                            planName,
                            packageLabel,
                            amount,
                            fee,
                            totalDebited,
                            receipt,
                        },
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    },
                    session
                );
                transactionId = tx._id.toString();
            });
        } finally {
            await session.endSession();
        }

        if (!tx || !receipt || !transactionId) {
            throw new HttpError(500, "Utility payment failed");
        }

        return {
            transactionId,
            receipt,
            idempotentReplay: false,
        };
    }

    private async payWithFallback({
        userId,
        payeeId,
        revenueWalletId,
        serviceId,
        type,
        customerRef,
        amount,
        fee,
        totalDebited,
        provider,
        planName,
        packageLabel,
        idempotencyKey,
    }: {
        userId: string;
        payeeId: string;
        revenueWalletId?: string;
        serviceId: string;
        type: UtilityType;
        customerRef: string;
        amount: number;
        fee: number;
        totalDebited: number;
        provider: string;
        planName: string;
        packageLabel: string;
        idempotencyKey?: string;
    }): Promise<UtilityPaymentResult> {
        let payerDebited = false;
        let payeeCredited = false;
        let revenueCredited = false;
        let paymentTx: ITransaction | null = null;
        let receipt: Record<string, unknown> | null = null;

        try {
            const debited = await userRepository.debitUser(userId, totalDebited);
            if (!debited) {
                throw new HttpError(402, "Top up your wallet", { code: "INSUFFICIENT_FUNDS" });
            }
            payerDebited = true;

            const credited = await userRepository.creditUser(payeeId, amount);
            if (!credited) {
                throw new HttpError(500, "Failed to credit payee wallet");
            }
            payeeCredited = true;

            if (fee > 0 && revenueWalletId) {
                const revenueCredit = await userRepository.creditUser(revenueWalletId, fee);
                if (!revenueCredit) {
                    throw new HttpError(500, "Failed to credit revenue wallet");
                }
                revenueCredited = true;
            }

            const txId = uuidv4();
            receipt = this.buildReceipt({
                type,
                serviceId,
                provider,
                planName,
                packageLabel,
                customerRef,
                amount,
                fee,
                totalDebited,
                txId,
                createdAt: new Date(),
            });

            paymentTx = await transactionRepository.createTransaction({
                from: new mongoose.Types.ObjectId(userId),
                to: new mongoose.Types.ObjectId(payeeId),
                amount: totalDebited,
                remark: `${type} payment`,
                status: "SUCCESS",
                txId,
                paymentType: "UTILITY_PAYMENT",
                meta: {
                    serviceType: type,
                    serviceId,
                    customerRef,
                    provider,
                    planName,
                    packageLabel,
                    amount,
                    fee,
                    totalDebited,
                    receipt,
                },
                ...(idempotencyKey ? { idempotencyKey } : {}),
            });

            return {
                transactionId: paymentTx._id.toString(),
                receipt,
                idempotentReplay: false,
            };
        } catch (error) {
            await this.compensateFallback({
                userId,
                payeeId,
                revenueWalletId,
                amount,
                fee,
                totalDebited,
                serviceType: type,
                payerDebited,
                payeeCredited,
                revenueCredited,
            });
            throw error;
        }
    }

    private async compensateFallback({
        userId,
        payeeId,
        revenueWalletId,
        amount,
        fee,
        totalDebited,
        serviceType,
        payerDebited,
        payeeCredited,
        revenueCredited,
    }: {
        userId: string;
        payeeId: string;
        revenueWalletId?: string;
        amount: number;
        fee: number;
        totalDebited: number;
        serviceType: UtilityType;
        payerDebited: boolean;
        payeeCredited: boolean;
        revenueCredited: boolean;
    }) {
        if (payeeCredited) {
            const reversedPayee = await userRepository.debitUser(payeeId, amount);
            if (!reversedPayee) {
                return;
            }
        }

        if (revenueCredited && revenueWalletId) {
            const reversedRevenue = await userRepository.debitUser(revenueWalletId, fee);
            if (!reversedRevenue) {
                return;
            }
        }

        if (payerDebited) {
            const refundedUser = await userRepository.creditUser(userId, totalDebited);
            if (!refundedUser) {
                return;
            }
        }

        if (payerDebited && payeeCredited) {
            await transactionRepository.createTransaction({
                from: new mongoose.Types.ObjectId(payeeId),
                to: new mongoose.Types.ObjectId(userId),
                amount: totalDebited,
                remark: "Utility fallback compensation refund",
                status: "SUCCESS",
                txId: uuidv4(),
                paymentType: "UTILITY_REFUND_COMP",
                meta: {
                    serviceType,
                    amount,
                    fee,
                    totalDebited,
                },
            });
        }
    }
}

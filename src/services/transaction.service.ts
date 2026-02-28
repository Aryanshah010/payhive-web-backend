import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../repositories/user.repository";
import { TransactionRepository, TransactionHistoryFilterDirection } from "../repositories/transaction.repository";
import { BankRepository } from "../repositories/bank.repository";
import { MoneyRequestRepository } from "../repositories/money-request.repository";
import { BankTransferService } from "./bank-transfer.service";
import { HttpError } from "../errors/http-error";
import { IUser } from "../models/user.model";
import { NotificationService } from "./notification.service";
import {
    BANK_TRANSFER_FIXED_FEE,
    DAILY_TRANSFER_LIMIT,
    MAX_TRANSFER_AMOUNT,
    MAX_PIN_ATTEMPTS,
    PIN_LOCKOUT_MINUTES,
} from "../configs";

let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();
let bankRepository = new BankRepository();
let moneyRequestRepository = new MoneyRequestRepository();
let bankTransferService = new BankTransferService();
let notificationService = new NotificationService();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PIN_LOCK_MS = PIN_LOCKOUT_MINUTES * 60 * 1000;

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;
const formatAmount = (amount: number) => normalizeAmount(amount).toFixed(2);

const mapUser = (user: IUser) => ({
    id: user._id,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
});

const maskAccountNumber = (accountNumber: string) => {
    const trimmed = accountNumber.trim();
    const lastFour = trimmed.slice(-4);
    const maskLength = Math.max(trimmed.length - 4, 0);
    return `${"*".repeat(maskLength)}${lastFour}`;
};

const parseBankAccountRegex = (pattern: string) => {
    try {
        return new RegExp(pattern);
    } catch {
        throw new HttpError(400, "Invalid bank configuration", { code: "INVALID_BANK" });
    }
};

export class TransactionService {
    private async notifyPaymentSuccess(options: {
        userId: string;
        title: string;
        body: string;
        txId?: string;
        amount: number;
        paymentType: string;
        direction: "DEBIT" | "CREDIT";
        counterpartyId?: string;
    }) {
        try {
            await notificationService.createNotification({
                userId: options.userId,
                title: options.title,
                body: options.body,
                type: "PAYMENT_SUCCESS",
                data: {
                    txId: options.txId,
                    amount: options.amount,
                    paymentType: options.paymentType,
                    direction: options.direction,
                    counterpartyId: options.counterpartyId,
                },
            });
        } catch (error) {
            console.error("Failed to create payment notification:", error);
        }
    }

    async lookupBeneficiary(requesterId: string, phoneNumber: string) {
        const user = await userRepository.getUserByPhoneNumber(phoneNumber);
        if (!user) throw new HttpError(404, "Recipient not found");

        if (user._id.toString() === requesterId) {
            throw new HttpError(400, "Cannot send money to yourself");
        }

        return mapUser(user);
    }

    async previewTransfer(userId: string, toPhoneNumber: string, amount: number, remark?: string) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        const toUser = await userRepository.getUserByPhoneNumber(toPhoneNumber);
        if (!toUser) throw new HttpError(404, "Recipient not found");

        if (fromUser._id.toString() === toUser._id.toString()) {
            throw new HttpError(400, "Cannot send money to yourself");
        }

        const normalizedAmount = normalizeAmount(amount);
        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && normalizedAmount > 2 * avg, avg30d: avg };

        return {
            from: mapUser(fromUser),
            to: mapUser(toUser),
            amount: normalizedAmount,
            remark,
            warning,
        };
    }

    async previewBankTransfer(
        userId: string,
        bankName: string,
        accountNumber: string,
        amount: number,
        remark?: string
    ) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        const bank = await bankRepository.getByNameOrCode(bankName);
        if (!bank || !bank.isActive) {
            throw new HttpError(400, "Invalid bank", { code: "INVALID_BANK" });
        }

        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount < bank.minTransfer || normalizedAmount > bank.maxTransfer) {
            throw new HttpError(400, "Invalid amount", { code: "INVALID_AMOUNT" });
        }

        const accountRegex = parseBankAccountRegex(bank.accountNumberRegex);
        const trimmedAccountNumber = accountNumber.trim();
        if (!accountRegex.test(trimmedAccountNumber)) {
            throw new HttpError(400, "Invalid account number", { code: "INVALID_ACCOUNT_NUMBER" });
        }

        const maskedAccount = maskAccountNumber(trimmedAccountNumber);
        const fee = BANK_TRANSFER_FIXED_FEE;
        const totalDebited = normalizeAmount(normalizedAmount + fee);
        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && normalizedAmount > 2 * avg, avg30d: avg };

        return {
            from: mapUser(fromUser),
            to: { id: bank._id, fullName: bank.name, phoneNumber: "" },
            amount: normalizedAmount,
            remark,
            paymentType: "BANK_TRANSFER",
            meta: {
                bankId: bank._id.toString(),
                bankName: bank.name,
                bankCode: bank.code,
                accountNumberMasked: maskedAccount,
                accountNumber: maskedAccount,
                amount: normalizedAmount,
                fee,
                totalDebited,
            },
            warning,
        };
    }

    async confirmTransfer(
        userId: string,
        toPhoneNumber: string,
        amount: number,
        remark: string | undefined,
        pin: string,
        moneyRequestId?: string,
        idempotencyKey?: string
    ) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        // Per-transaction limit check
        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount > MAX_TRANSFER_AMOUNT) {
            throw new HttpError(400, "Transfer amount exceeds maximum allowed limit");
        }

        if (!fromUser.pinHash) {
            throw new HttpError(400, "PIN not set");
        }

        const now = new Date();

        // Check existing PIN lockout state before verifying PIN
        if (fromUser.pinLockedUntil && fromUser.pinLockedUntil > now) {
            const remainingMs = fromUser.pinLockedUntil.getTime() - now.getTime();
            throw new HttpError(423, "PIN temporarily locked. Try again later", { remainingMs });
        }

        const validPin = await bcryptjs.compare(pin, fromUser.pinHash);

        if (!validPin) {
            // Handle PIN retry counting and potential lockout
            const currentAttempts = fromUser.pinAttempts || 0;
            const nextAttempts = currentAttempts + 1;

            const updateData: Partial<IUser> = {};
            let errorStatus = 401;
            let errorMessage: string;

            if (nextAttempts >= MAX_PIN_ATTEMPTS) {
                updateData.pinAttempts = 0;
                updateData.pinLockedUntil = new Date(now.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000);
                errorStatus = 423;
                errorMessage = "PIN temporarily locked. Try again later";
            } else {
                updateData.pinAttempts = nextAttempts;
                const remaining = MAX_PIN_ATTEMPTS - nextAttempts;
                errorMessage = `Invalid PIN. ${remaining} attempt(s) remaining.`;
            }

            await userRepository.updateUser(fromUser._id.toString(), updateData);

            if (errorStatus === 423) {
                throw new HttpError(errorStatus, errorMessage, { remainingMs: PIN_LOCK_MS });
            }

            throw new HttpError(errorStatus, errorMessage);
        }

        // On successful PIN verification, reset attempts / lockout state if needed
        if (fromUser.pinAttempts > 0 || fromUser.pinLockedUntil) {
            await userRepository.updateUser(fromUser._id.toString(), {
                pinAttempts: 0,
                pinLockedUntil: null,
            });
        }

        const toUser = await userRepository.getUserByPhoneNumber(toPhoneNumber);
        if (!toUser) throw new HttpError(404, "Recipient not found");

        if (fromUser._id.toString() === toUser._id.toString()) {
            throw new HttpError(400, "Cannot send money to yourself");
        }

        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && normalizedAmount > 2 * avg, avg30d: avg };

        if (idempotencyKey) {
            const existing = await transactionRepository.getByIdempotencyKey(
                fromUser._id.toString(),
                idempotencyKey
            );
            if (existing) {
                if (
                    existing.amount !== normalizedAmount ||
                    existing.to.toString() !== toUser._id.toString()
                ) {
                    throw new HttpError(409, "Idempotency key already used with different payload");
                }

                if (moneyRequestId) {
                    const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
                    const existingMoneyRequestId = (existingMeta.moneyRequestId ?? "").toString();
                    if (existingMoneyRequestId !== moneyRequestId) {
                        throw new HttpError(409, "Idempotency key already used with different payload");
                    }
                }

                return {
                    receipt: {
                        txId: existing.txId,
                        status: existing.status,
                        amount: existing.amount,
                        remark: existing.remark,
                        paymentType: existing.paymentType,
                        meta: existing.meta ?? null,
                        from: mapUser(fromUser),
                        to: mapUser(toUser),
                        createdAt: existing.createdAt,
                    },
                    warning,
                };
            }
        }

        let linkedMoneyRequest: { id: string } | null = null;
        if (moneyRequestId) {
            await moneyRequestRepository.expireByIdIfPending(moneyRequestId);
            const request = await moneyRequestRepository.getById(moneyRequestId);
            if (!request) {
                throw new HttpError(404, "Money request not found");
            }

            if (request.receiver.toString() !== fromUser._id.toString()) {
                throw new HttpError(404, "Money request not found");
            }

            if (request.requester.toString() !== toUser._id.toString()) {
                throw new HttpError(409, "Money request does not match recipient");
            }

            if (request.status === "EXPIRED") {
                throw new HttpError(410, "Money request expired");
            }

            if (request.status === "ACCEPTED") {
                throw new HttpError(409, "Money request already accepted");
            }

            if (request.status !== "PENDING") {
                throw new HttpError(409, `Money request already ${request.status.toLowerCase()}`);
            }

            if (normalizeAmount(request.amount) !== normalizedAmount) {
                throw new HttpError(409, "Money request amount mismatch");
            }

            linkedMoneyRequest = { id: request._id.toString() };
        }

        // Daily transfer limit check (before starting MongoDB transaction)
        const today = new Date();
        const todayTotal = await transactionRepository.getTotalDebitForDate(fromUser._id.toString(), today);
        if (todayTotal + normalizedAmount > DAILY_TRANSFER_LIMIT) {
            throw new HttpError(400, "Daily transfer limit exceeded");
        }

        const session = await mongoose.startSession();
        let receipt: any;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(fromUser._id.toString(), normalizedAmount, session);
                if (!debited) {
                    throw new HttpError(400, "Insufficient balance");
                }

                const credited = await userRepository.creditUser(toUser._id.toString(), normalizedAmount, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit recipient");
                }

                const tx = await transactionRepository.createTransaction(
                    {
                        from: fromUser._id,
                        to: toUser._id,
                        amount: normalizedAmount,
                        remark: remark || "",
                        status: "SUCCESS",
                        txId: uuidv4(),
                        ...(linkedMoneyRequest
                            ? {
                                  meta: {
                                      moneyRequestId: linkedMoneyRequest.id,
                                  },
                              }
                            : {}),
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    },
                    session
                );

                if (linkedMoneyRequest) {
                    const acceptedRequest = await moneyRequestRepository.markAcceptedIfPending(
                        linkedMoneyRequest.id,
                        tx._id,
                        session
                    );
                    if (!acceptedRequest) {
                        throw new HttpError(409, "Money request already processed");
                    }
                }

                receipt = {
                    txId: tx.txId,
                    status: tx.status,
                    amount: tx.amount,
                    remark: tx.remark,
                    paymentType: tx.paymentType,
                    meta: tx.meta ?? null,
                    from: mapUser(fromUser),
                    to: mapUser(toUser),
                    createdAt: tx.createdAt,
                };
            });
        } finally {
            session.endSession();
        }

        if (!receipt) {
            throw new HttpError(500, "Transfer failed");
        }

        const senderDisplayName = fromUser.fullName || fromUser.phoneNumber;
        await Promise.all([
            this.notifyPaymentSuccess({
                userId: fromUser._id.toString(),
                title: "Payment Successful",
                body: `Payment of Rs. ${formatAmount(normalizedAmount)} successful`,
                txId: receipt.txId,
                amount: normalizedAmount,
                paymentType: "TRANSFER",
                direction: "DEBIT",
                counterpartyId: toUser._id.toString(),
            }),
            this.notifyPaymentSuccess({
                userId: toUser._id.toString(),
                title: "Amount Received",
                body: `You received Rs. ${formatAmount(normalizedAmount)} from ${senderDisplayName}`,
                txId: receipt.txId,
                amount: normalizedAmount,
                paymentType: "TRANSFER",
                direction: "CREDIT",
                counterpartyId: fromUser._id.toString(),
            }),
        ]);

        return { receipt, warning };
    }

    async confirmBankTransfer(
        userId: string,
        bankName: string,
        accountNumber: string,
        amount: number,
        remark: string | undefined,
        pin: string,
        idempotencyKey?: string
    ) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount > MAX_TRANSFER_AMOUNT) {
            throw new HttpError(400, "Transfer amount exceeds maximum allowed limit");
        }

        if (!fromUser.pinHash) {
            throw new HttpError(400, "PIN not set");
        }

        const now = new Date();
        if (fromUser.pinLockedUntil && fromUser.pinLockedUntil > now) {
            const remainingMs = fromUser.pinLockedUntil.getTime() - now.getTime();
            throw new HttpError(423, "PIN temporarily locked. Try again later", { remainingMs });
        }

        const validPin = await bcryptjs.compare(pin, fromUser.pinHash);
        if (!validPin) {
            const currentAttempts = fromUser.pinAttempts || 0;
            const nextAttempts = currentAttempts + 1;

            const updateData: Partial<IUser> = {};
            let errorStatus = 401;
            let errorMessage: string;

            if (nextAttempts >= MAX_PIN_ATTEMPTS) {
                updateData.pinAttempts = 0;
                updateData.pinLockedUntil = new Date(now.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000);
                errorStatus = 423;
                errorMessage = "PIN temporarily locked. Try again later";
            } else {
                updateData.pinAttempts = nextAttempts;
                const remaining = MAX_PIN_ATTEMPTS - nextAttempts;
                errorMessage = `Invalid PIN. ${remaining} attempt(s) remaining.`;
            }

            await userRepository.updateUser(fromUser._id.toString(), updateData);

            if (errorStatus === 423) {
                throw new HttpError(errorStatus, errorMessage, { remainingMs: PIN_LOCK_MS });
            }

            throw new HttpError(errorStatus, errorMessage);
        }

        if (fromUser.pinAttempts > 0 || fromUser.pinLockedUntil) {
            await userRepository.updateUser(fromUser._id.toString(), {
                pinAttempts: 0,
                pinLockedUntil: null,
            });
        }

        const bank = await bankRepository.getByNameOrCode(bankName);
        if (!bank || !bank.isActive) {
            throw new HttpError(400, "Invalid bank", { code: "INVALID_BANK" });
        }

        const accountRegex = parseBankAccountRegex(bank.accountNumberRegex);
        const trimmedAccountNumber = accountNumber.trim();
        if (!accountRegex.test(trimmedAccountNumber)) {
            throw new HttpError(400, "Invalid account number", { code: "INVALID_ACCOUNT_NUMBER" });
        }

        const fee = BANK_TRANSFER_FIXED_FEE;
        const totalDebited = normalizeAmount(normalizedAmount + fee);
        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && normalizedAmount > 2 * avg, avg30d: avg };

        if (idempotencyKey) {
            const existing = await transactionRepository.getByIdempotencyKey(
                fromUser._id.toString(),
                idempotencyKey
            );
            if (existing) {
                const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
                const existingBankId = existingMeta.bankId as string | undefined;

                if (
                    existing.paymentType !== "BANK_TRANSFER" ||
                    existing.amount !== totalDebited ||
                    (existingBankId && existingBankId !== bank._id.toString())
                ) {
                    throw new HttpError(409, "Idempotency key already used with different payload");
                }

                const toUser = await userRepository.getUserById(existing.to.toString());

                return {
                    receipt: {
                        txId: existing.txId,
                        status: existing.status,
                        amount: existing.amount,
                        remark: existing.remark,
                        paymentType: existing.paymentType,
                        meta: existing.meta ?? null,
                        from: mapUser(fromUser),
                        to: toUser ? mapUser(toUser) : { id: existing.to },
                        createdAt: existing.createdAt,
                    },
                    warning,
                };
            }
        }

        const today = new Date();
        const todayTotal = await transactionRepository.getTotalDebitForDate(fromUser._id.toString(), today);
        if (todayTotal + totalDebited > DAILY_TRANSFER_LIMIT) {
            throw new HttpError(400, "Daily transfer limit exceeded");
        }

        const transfer = await bankTransferService.transferToBank(
            fromUser._id.toString(),
            bank._id.toString(),
            trimmedAccountNumber,
            normalizedAmount,
            remark
        );

        const txDoc = await transactionRepository.getByTxIdForUser(fromUser._id.toString(), transfer.txId);
        const toUser = txDoc ? await userRepository.getUserById(txDoc.to.toString()) : null;

        const receipt = txDoc
            ? {
                  txId: txDoc.txId,
                  status: txDoc.status,
                  amount: txDoc.amount,
                  remark: txDoc.remark,
                  paymentType: txDoc.paymentType,
                  meta: txDoc.meta ?? null,
                  from: mapUser(fromUser),
                  to: toUser ? mapUser(toUser) : { id: txDoc.to },
                  createdAt: txDoc.createdAt,
              }
            : {
                  txId: transfer.txId,
                  status: "SUCCESS",
                  amount: totalDebited,
                  remark: remark || "",
                  paymentType: "BANK_TRANSFER",
                  meta: {
                      bankId: bank._id.toString(),
                      bankName: bank.name,
                      bankCode: bank.code,
                      accountNumberMasked: transfer.accountNumberMasked,
                      accountNumber: transfer.accountNumberMasked,
                      amount: normalizedAmount,
                      fee,
                      totalDebited,
                  },
                  from: mapUser(fromUser),
                  to: { id: transfer.transactionId },
                  createdAt: transfer.createdAt,
              };

        await this.notifyPaymentSuccess({
            userId: fromUser._id.toString(),
            title: "Payment Successful",
            body: `Bank transfer of Rs. ${formatAmount(normalizedAmount)} successful`,
            txId: receipt.txId,
            amount: normalizedAmount,
            paymentType: "BANK_TRANSFER",
            direction: "DEBIT",
            counterpartyId: bank._id.toString(),
        });

        return { receipt, warning };
    }

    async getHistory(
        userId: string,
        page: number,
        limit: number,
        search: string = "",
        direction: TransactionHistoryFilterDirection = "all"
    ) {
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const skip = (safePage - 1) * safeLimit;

        const { items, total } = await transactionRepository.listByUser({
            userId,
            skip,
            limit: safeLimit,
            search,
            direction,
        });
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        return {
            items,
            total,
            page: safePage,
            limit: safeLimit,
            totalPages,
        };
    }

    async getByTxId(userId: string, txId: string) {
        const tx = await transactionRepository.getByTxIdForUser(userId, txId);
        if (!tx) throw new HttpError(404, "Transaction not found");

        const fromUser = await userRepository.getUserById(tx.from.toString());
        const toUser = await userRepository.getUserById(tx.to.toString());

        return {
            txId: tx.txId,
            status: tx.status,
            amount: tx.amount,
            remark: tx.remark,
            paymentType: tx.paymentType,
            meta: tx.meta ?? null,
            from: fromUser ? mapUser(fromUser) : { id: tx.from },
            to: toUser ? mapUser(toUser) : { id: tx.to },
            createdAt: tx.createdAt,
        };
    }
}

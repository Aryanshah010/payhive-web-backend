import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../repositories/user.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { HttpError } from "../errors/http-error";
import { IUser } from "../models/user.model";
import { DAILY_TRANSFER_LIMIT, MAX_TRANSFER_AMOUNT, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MINUTES } from "../configs";

let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PIN_LOCK_MS = PIN_LOCKOUT_MINUTES * 60 * 1000;

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;

const mapUser = (user: IUser) => ({
    id: user._id,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
});

export class TransactionService {
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

    async confirmTransfer(
        userId: string,
        toPhoneNumber: string,
        amount: number,
        remark: string | undefined,
        pin: string,
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

                return {
                    receipt: {
                        txId: existing.txId,
                        status: existing.status,
                        amount: existing.amount,
                        remark: existing.remark,
                        from: mapUser(fromUser),
                        to: mapUser(toUser),
                        createdAt: existing.createdAt,
                    },
                    warning,
                };
            }
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
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    },
                    session
                );

                receipt = {
                    txId: tx.txId,
                    status: tx.status,
                    amount: tx.amount,
                    remark: tx.remark,
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

        return { receipt, warning };
    }

    async getHistory(userId: string, page: number, limit: number) {
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const skip = (safePage - 1) * safeLimit;

        const { items, total } = await transactionRepository.listByUser(userId, skip, safeLimit);
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        const mapped = await Promise.all(
            items.map(async (tx) => {
                const fromUser = await userRepository.getUserById(tx.from.toString());
                const toUser = await userRepository.getUserById(tx.to.toString());
                return {
                    txId: tx.txId,
                    status: tx.status,
                    amount: tx.amount,
                    remark: tx.remark,
                    from: fromUser ? mapUser(fromUser) : { id: tx.from },
                    to: toUser ? mapUser(toUser) : { id: tx.to },
                    createdAt: tx.createdAt,
                };
            })
        );

        return {
            items: mapped,
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
            from: fromUser ? mapUser(fromUser) : { id: tx.from },
            to: toUser ? mapUser(toUser) : { id: tx.to },
            createdAt: tx.createdAt,
        };
    }
}

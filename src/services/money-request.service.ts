import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { HttpError } from "../errors/http-error";
import { IUser, UserModel } from "../models/user.model";
import { UserRepository } from "../repositories/user.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { MoneyRequestRepository } from "../repositories/money-request.repository";
import { NotificationService } from "./notification.service";
import { IMoneyRequest } from "../models/money-request.model";
import { MoneyRequestStatus } from "../types/money-request.type";
import {
    DAILY_TRANSFER_LIMIT,
    MAX_PIN_ATTEMPTS,
    MAX_TRANSFER_AMOUNT,
    PIN_LOCKOUT_MINUTES,
} from "../configs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PIN_LOCK_MS = PIN_LOCKOUT_MINUTES * 60 * 1000;

let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();
let moneyRequestRepository = new MoneyRequestRepository();
let notificationService = new NotificationService();

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;
const formatAmount = (amount: number) => normalizeAmount(amount).toFixed(2);

const mapUser = (user: IUser | { _id: mongoose.Types.ObjectId; fullName?: string; phoneNumber?: string }) => ({
    id: user._id.toString(),
    fullName: user.fullName || "",
    phoneNumber: user.phoneNumber || "",
});

type MoneyRequestStatusFilter = "all" | "pending" | "accepted" | "rejected" | "canceled" | "expired";

interface MoneyRequestReceipt {
    txId: string;
    status: string;
    amount: number;
    remark?: string;
    paymentType?: string;
    meta?: Record<string, unknown> | null;
    from: ReturnType<typeof mapUser>;
    to: ReturnType<typeof mapUser>;
    createdAt: Date;
}

export class MoneyRequestService {
    private async notifyPaymentSuccess(options: {
        userId: string;
        title: string;
        body: string;
        txId?: string;
        amount: number;
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
                    paymentType: "TRANSFER",
                    direction: options.direction,
                    counterpartyId: options.counterpartyId,
                },
            });
        } catch (error) {
            console.error("Failed to create payment notification:", error);
        }
    }

    private async notifyRequestLifecycle(options: {
        userId: string;
        action: "CREATED" | "REJECTED" | "CANCELED";
        moneyRequestId: string;
        amount: number;
        title: string;
        body: string;
        requester: IUser;
        receiver: IUser;
    }) {
        try {
            await notificationService.createNotification({
                userId: options.userId,
                title: options.title,
                body: options.body,
                type: "REQUEST_MONEY",
                data: {
                    moneyRequestId: options.moneyRequestId,
                    action: options.action,
                    amount: options.amount,
                    requesterId: options.requester._id.toString(),
                    requesterName: options.requester.fullName || "",
                    requesterPhoneNumber: options.requester.phoneNumber,
                    receiverId: options.receiver._id.toString(),
                    receiverName: options.receiver.fullName || "",
                    receiverPhoneNumber: options.receiver.phoneNumber,
                },
            });
        } catch (error) {
            console.error("Failed to create money request notification:", error);
        }
    }

    private mapStatusFilter(status: MoneyRequestStatusFilter): MoneyRequestStatus | undefined {
        if (status === "all") {
            return undefined;
        }

        return status.toUpperCase() as MoneyRequestStatus;
    }

    private async getUsersMapFromRequests(requests: IMoneyRequest[]) {
        const userIds = Array.from(
            new Set(
                requests.flatMap((request) => [request.requester.toString(), request.receiver.toString()])
            )
        );

        if (userIds.length === 0) {
            return new Map<string, IUser>();
        }

        const users = await UserModel.find({ _id: { $in: userIds } });
        const usersMap = new Map<string, IUser>();
        users.forEach((user) => {
            usersMap.set(user._id.toString(), user);
        });

        return usersMap;
    }

    private mapMoneyRequest(request: IMoneyRequest, usersMap?: Map<string, IUser>) {
        const requesterId = request.requester.toString();
        const receiverId = request.receiver.toString();
        const requester = usersMap?.get(requesterId);
        const receiver = usersMap?.get(receiverId);

        return {
            id: request._id.toString(),
            requester: requester ? mapUser(requester) : { id: requesterId, fullName: "", phoneNumber: "" },
            receiver: receiver ? mapUser(receiver) : { id: receiverId, fullName: "", phoneNumber: "" },
            amount: request.amount,
            remark: request.remark || "",
            status: request.status,
            expiresAt: request.expiresAt,
            respondedAt: request.respondedAt || null,
            transactionId: request.transactionId?.toString() || null,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
        };
    }

    private async getRequestOrThrow(requestId: string) {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            throw new HttpError(400, "Invalid request ID");
        }

        const request = await moneyRequestRepository.getById(requestId);
        if (!request) {
            throw new HttpError(404, "Money request not found");
        }

        return request;
    }

    private async validatePinOrThrow(user: IUser, pin: string) {
        if (!user.pinHash) {
            throw new HttpError(400, "PIN not set");
        }

        const now = new Date();
        if (user.pinLockedUntil && user.pinLockedUntil > now) {
            const remainingMs = user.pinLockedUntil.getTime() - now.getTime();
            throw new HttpError(423, "PIN temporarily locked. Try again later", { remainingMs });
        }

        const validPin = await bcryptjs.compare(pin, user.pinHash);
        if (!validPin) {
            const currentAttempts = user.pinAttempts || 0;
            const nextAttempts = currentAttempts + 1;
            const updateData: Partial<IUser> = {};

            let errorStatus = 401;
            let errorMessage: string;

            if (nextAttempts >= MAX_PIN_ATTEMPTS) {
                updateData.pinAttempts = 0;
                updateData.pinLockedUntil = new Date(now.getTime() + PIN_LOCK_MS);
                errorStatus = 423;
                errorMessage = "PIN temporarily locked. Try again later";
            } else {
                updateData.pinAttempts = nextAttempts;
                const remaining = MAX_PIN_ATTEMPTS - nextAttempts;
                errorMessage = `Invalid PIN. ${remaining} attempt(s) remaining.`;
            }

            await userRepository.updateUser(user._id.toString(), updateData);

            if (errorStatus === 423) {
                throw new HttpError(errorStatus, errorMessage, { remainingMs: PIN_LOCK_MS });
            }

            throw new HttpError(errorStatus, errorMessage);
        }

        if (user.pinAttempts > 0 || user.pinLockedUntil) {
            await userRepository.updateUser(user._id.toString(), {
                pinAttempts: 0,
                pinLockedUntil: null,
            });
        }
    }

    private async getAcceptedReceipt(request: IMoneyRequest, payer: IUser, payee: IUser) {
        if (!request.transactionId) {
            throw new HttpError(500, "Accepted request is missing transaction reference");
        }

        const transaction = await transactionRepository.getById(request.transactionId.toString());
        if (!transaction) {
            throw new HttpError(500, "Linked transaction not found");
        }

        return {
            txId: transaction.txId,
            status: transaction.status,
            amount: transaction.amount,
            remark: transaction.remark,
            paymentType: transaction.paymentType,
            meta: transaction.meta ?? null,
            from: mapUser(payer),
            to: mapUser(payee),
            createdAt: transaction.createdAt,
        };
    }

    async createRequest(userId: string, toPhoneNumber: string, amount: number, remark?: string) {
        const requester = await userRepository.getUserById(userId);
        if (!requester) {
            throw new HttpError(404, "User not found");
        }

        const receiver = await userRepository.getUserByPhoneNumber(toPhoneNumber);
        if (!receiver) {
            throw new HttpError(404, "Recipient not found");
        }

        if (requester._id.toString() === receiver._id.toString()) {
            throw new HttpError(400, "Cannot request money from yourself");
        }

        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount > MAX_TRANSFER_AMOUNT) {
            throw new HttpError(400, "Transfer amount exceeds maximum allowed limit");
        }

        const request = await moneyRequestRepository.createRequest({
            requester: requester._id,
            receiver: receiver._id,
            amount: normalizedAmount,
            remark: remark || "",
            status: "PENDING",
            expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
            respondedAt: null,
            transactionId: null,
        });

        const requesterName = requester.fullName || requester.phoneNumber;
        await this.notifyRequestLifecycle({
            userId: receiver._id.toString(),
            action: "CREATED",
            moneyRequestId: request._id.toString(),
            amount: normalizedAmount,
            title: "Money Request",
            body: `${requesterName} requested Rs. ${formatAmount(normalizedAmount)}`,
            requester,
            receiver,
        });

        return this.mapMoneyRequest(request, new Map<string, IUser>([
            [requester._id.toString(), requester],
            [receiver._id.toString(), receiver],
        ]));
    }

    async listIncoming(userId: string, page: number, limit: number, status: MoneyRequestStatusFilter) {
        await moneyRequestRepository.expirePendingForUser(userId);

        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const skip = (safePage - 1) * safeLimit;
        const mappedStatus = this.mapStatusFilter(status);

        const { items, total } = await moneyRequestRepository.listByUser({
            userId,
            role: "incoming",
            skip,
            limit: safeLimit,
            status: mappedStatus,
        });

        const usersMap = await this.getUsersMapFromRequests(items);
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        return {
            items: items.map((item) => this.mapMoneyRequest(item, usersMap)),
            total,
            page: safePage,
            limit: safeLimit,
            totalPages,
        };
    }

    async listOutgoing(userId: string, page: number, limit: number, status: MoneyRequestStatusFilter) {
        await moneyRequestRepository.expirePendingForUser(userId);

        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const skip = (safePage - 1) * safeLimit;
        const mappedStatus = this.mapStatusFilter(status);

        const { items, total } = await moneyRequestRepository.listByUser({
            userId,
            role: "outgoing",
            skip,
            limit: safeLimit,
            status: mappedStatus,
        });

        const usersMap = await this.getUsersMapFromRequests(items);
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        return {
            items: items.map((item) => this.mapMoneyRequest(item, usersMap)),
            total,
            page: safePage,
            limit: safeLimit,
            totalPages,
        };
    }

    async getById(userId: string, requestId: string) {
        await moneyRequestRepository.expireByIdIfPending(requestId);
        const request = await this.getRequestOrThrow(requestId);

        const requesterId = request.requester.toString();
        const receiverId = request.receiver.toString();
        if (requesterId !== userId && receiverId !== userId) {
            throw new HttpError(404, "Money request not found");
        }

        const usersMap = await this.getUsersMapFromRequests([request]);
        return this.mapMoneyRequest(request, usersMap);
    }

    async acceptRequest(userId: string, requestId: string, pin: string) {
        await moneyRequestRepository.expireByIdIfPending(requestId);
        const request = await this.getRequestOrThrow(requestId);

        if (request.receiver.toString() !== userId) {
            throw new HttpError(404, "Money request not found");
        }

        const payer = await userRepository.getUserById(request.receiver.toString());
        const payee = await userRepository.getUserById(request.requester.toString());
        if (!payer || !payee) {
            throw new HttpError(404, "User not found");
        }

        if (request.status === "EXPIRED") {
            throw new HttpError(410, "Money request expired");
        }

        if (request.status === "ACCEPTED") {
            const receipt = await this.getAcceptedReceipt(request, payer, payee);
            return {
                request: this.mapMoneyRequest(request, new Map<string, IUser>([
                    [payer._id.toString(), payer],
                    [payee._id.toString(), payee],
                ])),
                receipt,
            };
        }

        if (request.status !== "PENDING") {
            throw new HttpError(409, `Money request already ${request.status.toLowerCase()}`);
        }

        const normalizedAmount = normalizeAmount(request.amount);
        if (normalizedAmount > MAX_TRANSFER_AMOUNT) {
            throw new HttpError(400, "Transfer amount exceeds maximum allowed limit");
        }

        await this.validatePinOrThrow(payer, pin);

        const today = new Date();
        const todayTotal = await transactionRepository.getTotalDebitForDate(payer._id.toString(), today);
        if (todayTotal + normalizedAmount > DAILY_TRANSFER_LIMIT) {
            throw new HttpError(400, "Daily transfer limit exceeded");
        }

        const session = await mongoose.startSession();
        let receipt: MoneyRequestReceipt | null = null;
        let updatedRequest: IMoneyRequest | null = null;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(payer._id.toString(), normalizedAmount, session);
                if (!debited) {
                    throw new HttpError(400, "Insufficient balance");
                }

                const credited = await userRepository.creditUser(payee._id.toString(), normalizedAmount, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit recipient");
                }

                const tx = await transactionRepository.createTransaction(
                    {
                        from: payer._id,
                        to: payee._id,
                        amount: normalizedAmount,
                        remark: request.remark || "",
                        status: "SUCCESS",
                        txId: uuidv4(),
                        paymentType: "TRANSFER",
                        meta: {
                            moneyRequestId: request._id.toString(),
                        },
                    },
                    session
                );

                updatedRequest = await moneyRequestRepository.markAcceptedIfPending(
                    request._id.toString(),
                    tx._id,
                    session
                );
                if (!updatedRequest) {
                    throw new HttpError(409, "Money request already processed");
                }

                receipt = {
                    txId: tx.txId,
                    status: tx.status,
                    amount: tx.amount,
                    remark: tx.remark,
                    paymentType: tx.paymentType,
                    meta: tx.meta ?? null,
                    from: mapUser(payer),
                    to: mapUser(payee),
                    createdAt: tx.createdAt,
                };
            });
        } finally {
            session.endSession();
        }

        const finalizedReceipt = receipt as MoneyRequestReceipt | null;
        const finalizedRequest = updatedRequest as IMoneyRequest | null;

        if (!finalizedReceipt || !finalizedRequest) {
            throw new HttpError(500, "Failed to accept money request");
        }

        const payerDisplayName = payer.fullName || payer.phoneNumber;
        await Promise.all([
            this.notifyPaymentSuccess({
                userId: payer._id.toString(),
                title: "Payment Successful",
                body: `Payment of Rs. ${formatAmount(normalizedAmount)} successful`,
                txId: finalizedReceipt.txId,
                amount: normalizedAmount,
                direction: "DEBIT",
                counterpartyId: payee._id.toString(),
            }),
            this.notifyPaymentSuccess({
                userId: payee._id.toString(),
                title: "Amount Received",
                body: `You received Rs. ${formatAmount(normalizedAmount)} from ${payerDisplayName}`,
                txId: finalizedReceipt.txId,
                amount: normalizedAmount,
                direction: "CREDIT",
                counterpartyId: payer._id.toString(),
            }),
        ]);

        return {
            request: this.mapMoneyRequest(finalizedRequest, new Map<string, IUser>([
                [payer._id.toString(), payer],
                [payee._id.toString(), payee],
            ])),
            receipt: finalizedReceipt,
        };
    }

    async rejectRequest(userId: string, requestId: string) {
        await moneyRequestRepository.expireByIdIfPending(requestId);
        const request = await this.getRequestOrThrow(requestId);

        if (request.receiver.toString() !== userId) {
            throw new HttpError(404, "Money request not found");
        }

        const requester = await userRepository.getUserById(request.requester.toString());
        const receiver = await userRepository.getUserById(request.receiver.toString());
        if (!requester || !receiver) {
            throw new HttpError(404, "User not found");
        }

        if (request.status === "EXPIRED") {
            throw new HttpError(410, "Money request expired");
        }

        if (request.status === "REJECTED") {
            return this.mapMoneyRequest(request, new Map<string, IUser>([
                [requester._id.toString(), requester],
                [receiver._id.toString(), receiver],
            ]));
        }

        if (request.status !== "PENDING") {
            throw new HttpError(409, `Money request already ${request.status.toLowerCase()}`);
        }

        const updatedRequest = await moneyRequestRepository.markStatusIfPending(
            request._id.toString(),
            "REJECTED"
        );
        if (!updatedRequest) {
            throw new HttpError(409, "Money request already processed");
        }

        const receiverName = receiver.fullName || receiver.phoneNumber;
        await this.notifyRequestLifecycle({
            userId: requester._id.toString(),
            action: "REJECTED",
            moneyRequestId: updatedRequest._id.toString(),
            amount: updatedRequest.amount,
            title: "Money Request Rejected",
            body: `${receiverName} rejected your request of Rs. ${formatAmount(updatedRequest.amount)}`,
            requester,
            receiver,
        });

        return this.mapMoneyRequest(updatedRequest, new Map<string, IUser>([
            [requester._id.toString(), requester],
            [receiver._id.toString(), receiver],
        ]));
    }

    async cancelRequest(userId: string, requestId: string) {
        await moneyRequestRepository.expireByIdIfPending(requestId);
        const request = await this.getRequestOrThrow(requestId);

        if (request.requester.toString() !== userId) {
            throw new HttpError(404, "Money request not found");
        }

        const requester = await userRepository.getUserById(request.requester.toString());
        const receiver = await userRepository.getUserById(request.receiver.toString());
        if (!requester || !receiver) {
            throw new HttpError(404, "User not found");
        }

        if (request.status === "EXPIRED") {
            throw new HttpError(410, "Money request expired");
        }

        if (request.status === "CANCELED") {
            return this.mapMoneyRequest(request, new Map<string, IUser>([
                [requester._id.toString(), requester],
                [receiver._id.toString(), receiver],
            ]));
        }

        if (request.status !== "PENDING") {
            throw new HttpError(409, `Money request already ${request.status.toLowerCase()}`);
        }

        const updatedRequest = await moneyRequestRepository.markStatusIfPending(
            request._id.toString(),
            "CANCELED"
        );
        if (!updatedRequest) {
            throw new HttpError(409, "Money request already processed");
        }

        const requesterName = requester.fullName || requester.phoneNumber;
        await this.notifyRequestLifecycle({
            userId: receiver._id.toString(),
            action: "CANCELED",
            moneyRequestId: updatedRequest._id.toString(),
            amount: updatedRequest.amount,
            title: "Money Request Canceled",
            body: `${requesterName} canceled a request of Rs. ${formatAmount(updatedRequest.amount)}`,
            requester,
            receiver,
        });

        return this.mapMoneyRequest(updatedRequest, new Map<string, IUser>([
            [requester._id.toString(), requester],
            [receiver._id.toString(), receiver],
        ]));
    }
}

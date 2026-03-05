import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { HttpError } from "../errors/http-error";
import { IUser } from "../models/user.model";
import { IUndoRequest } from "../models/undo-request.model";
import { NotificationService } from "./notification.service";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UndoRequestRepository } from "../repositories/undo-request.repository";
import { UserRepository } from "../repositories/user.repository";
import { MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MINUTES } from "../configs";

const PIN_LOCK_MS = PIN_LOCKOUT_MINUTES * 60 * 1000;

let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();
let undoRequestRepository = new UndoRequestRepository();
let notificationService = new NotificationService();

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;
const formatAmount = (amount: number) => normalizeAmount(amount).toFixed(2);

const mapUser = (user: IUser | { _id: mongoose.Types.ObjectId; fullName?: string; phoneNumber?: string }) => ({
    id: user._id.toString(),
    fullName: user.fullName || "",
    phoneNumber: user.phoneNumber || "",
});

const isDuplicateKeyError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    if (!("code" in error)) {
        return false;
    }

    return (error as { code?: number }).code === 11000;
};

interface UndoReceipt {
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

export class UndoRequestService {
    private async notifyUndoLifecycle(options: {
        userId: string;
        action: "CREATED" | "ACCEPTED" | "DENIED";
        undoRequestId: string;
        originalTxId: string;
        transactionId: string;
        amount: number;
        requester: IUser;
        receiver: IUser;
        title: string;
        body: string;
        refundTxId?: string;
    }) {
        try {
            await notificationService.createNotification({
                userId: options.userId,
                title: options.title,
                body: options.body,
                type: "UNDO_REQUEST",
                data: {
                    undoRequestId: options.undoRequestId,
                    action: options.action,
                    originalTxId: options.originalTxId,
                    transactionId: options.transactionId,
                    amount: options.amount,
                    requesterId: options.requester._id.toString(),
                    requesterName: options.requester.fullName || "",
                    requesterPhoneNumber: options.requester.phoneNumber,
                    receiverId: options.receiver._id.toString(),
                    receiverName: options.receiver.fullName || "",
                    receiverPhoneNumber: options.receiver.phoneNumber,
                    ...(options.refundTxId ? { refundTxId: options.refundTxId } : {}),
                },
            });
        } catch (error) {
            console.error("Failed to create undo request notification:", error);
        }
    }

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

    private mapUndoRequest(request: IUndoRequest, usersMap?: Map<string, IUser>, originalTxId?: string | null) {
        const requesterId = request.requester.toString();
        const receiverId = request.receiver.toString();
        const requester = usersMap?.get(requesterId);
        const receiver = usersMap?.get(receiverId);

        return {
            id: request._id.toString(),
            transactionId: request.transactionId.toString(),
            originalTxId: originalTxId || null,
            requester: requester ? mapUser(requester) : { id: requesterId, fullName: "", phoneNumber: "" },
            receiver: receiver ? mapUser(receiver) : { id: receiverId, fullName: "", phoneNumber: "" },
            amount: request.amount,
            status: request.status,
            refundTransactionId: request.refundTransactionId?.toString() || null,
            respondedAt: request.respondedAt || null,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
        };
    }

    private async getRequestOrThrow(requestId: string) {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            throw new HttpError(400, "Invalid undo request ID");
        }

        const request = await undoRequestRepository.getById(requestId);
        if (!request) {
            throw new HttpError(404, "Undo request not found");
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

    private async getAcceptedReceipt(
        request: IUndoRequest,
        requester: IUser,
        receiver: IUser
    ): Promise<UndoReceipt> {
        if (!request.refundTransactionId) {
            throw new HttpError(500, "Accepted undo request is missing refund transaction reference");
        }

        const refundTransaction = await transactionRepository.getById(request.refundTransactionId.toString());
        if (!refundTransaction) {
            throw new HttpError(500, "Refund transaction not found");
        }

        return {
            txId: refundTransaction.txId,
            status: refundTransaction.status,
            amount: refundTransaction.amount,
            remark: refundTransaction.remark,
            paymentType: refundTransaction.paymentType,
            meta: refundTransaction.meta ?? null,
            from: mapUser(receiver),
            to: mapUser(requester),
            createdAt: refundTransaction.createdAt,
        };
    }

    async createUndoRequest(userId: string, txId: string) {
        const transaction = await transactionRepository.getByTxIdForUser(userId, txId);
        if (!transaction) {
            throw new HttpError(404, "Transaction not found");
        }

        if (transaction.from.toString() !== userId) {
            throw new HttpError(404, "Transaction not found");
        }

        if (transaction.status !== "SUCCESS") {
            throw new HttpError(409, "Only successful transactions can be undone");
        }

        if (transaction.paymentType !== "TRANSFER") {
            throw new HttpError(400, "Undo is only supported for transfer transactions");
        }

        const requester = await userRepository.getUserById(transaction.from.toString());
        const receiver = await userRepository.getUserById(transaction.to.toString());
        if (!requester || !receiver) {
            throw new HttpError(404, "User not found");
        }

        let undoRequest: IUndoRequest;
        try {
            undoRequest = await undoRequestRepository.createRequest({
                transactionId: transaction._id,
                requester: transaction.from,
                receiver: transaction.to,
                amount: transaction.amount,
                status: "PENDING",
                refundTransactionId: null,
                respondedAt: null,
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new HttpError(409, "Undo already requested for this transaction");
            }
            throw error;
        }

        const requesterName = requester.fullName || requester.phoneNumber;
        await this.notifyUndoLifecycle({
            userId: receiver._id.toString(),
            action: "CREATED",
            undoRequestId: undoRequest._id.toString(),
            originalTxId: transaction.txId,
            transactionId: transaction._id.toString(),
            amount: undoRequest.amount,
            requester,
            receiver,
            title: "Undo Request",
            body: `${requesterName} requested undo of Rs. ${formatAmount(undoRequest.amount)}`,
        });

        return this.mapUndoRequest(
            undoRequest,
            new Map<string, IUser>([
                [requester._id.toString(), requester],
                [receiver._id.toString(), receiver],
            ]),
            transaction.txId
        );
    }

    async acceptUndoRequest(userId: string, requestId: string, pin: string) {
        const request = await this.getRequestOrThrow(requestId);

        if (request.receiver.toString() !== userId) {
            throw new HttpError(404, "Undo request not found");
        }

        const requester = await userRepository.getUserById(request.requester.toString());
        const receiver = await userRepository.getUserById(request.receiver.toString());
        if (!requester || !receiver) {
            throw new HttpError(404, "User not found");
        }

        const originalTransaction = await transactionRepository.getById(request.transactionId.toString());
        if (!originalTransaction) {
            throw new HttpError(500, "Original transaction not found");
        }

        if (request.status === "ACCEPTED") {
            const receipt = await this.getAcceptedReceipt(request, requester, receiver);
            return {
                request: this.mapUndoRequest(
                    request,
                    new Map<string, IUser>([
                        [requester._id.toString(), requester],
                        [receiver._id.toString(), receiver],
                    ]),
                    originalTransaction.txId
                ),
                receipt,
            };
        }

        if (request.status === "DENIED") {
            throw new HttpError(409, "Undo request already denied");
        }

        if (request.status !== "PENDING") {
            throw new HttpError(409, `Undo request already ${(request.status as string).toLowerCase()}`);
        }

        await this.validatePinOrThrow(receiver, pin);

        const normalizedAmount = normalizeAmount(request.amount);
        const session = await mongoose.startSession();
        let receipt: UndoReceipt | null = null;
        let updatedRequest: IUndoRequest | null = null;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(receiver._id.toString(), normalizedAmount, session);
                if (!debited) {
                    throw new HttpError(400, "Insufficient balance");
                }

                const credited = await userRepository.creditUser(
                    requester._id.toString(),
                    normalizedAmount,
                    session
                );
                if (!credited) {
                    throw new HttpError(500, "Failed to credit sender");
                }

                const refundTransaction = await transactionRepository.createTransaction(
                    {
                        from: receiver._id,
                        to: requester._id,
                        amount: normalizedAmount,
                        remark: `Undo refund for ${originalTransaction.txId}`,
                        status: "SUCCESS",
                        txId: uuidv4(),
                        paymentType: "TRANSFER",
                        meta: {
                            undoRequestId: request._id.toString(),
                            originalTransactionId: request.transactionId.toString(),
                            originalTxId: originalTransaction.txId,
                            reason: "UNDO_REFUND",
                        },
                    },
                    session
                );

                updatedRequest = await undoRequestRepository.markAcceptedIfPending(
                    request._id.toString(),
                    refundTransaction._id,
                    session
                );
                if (!updatedRequest) {
                    throw new HttpError(409, "Undo request already processed");
                }

                receipt = {
                    txId: refundTransaction.txId,
                    status: refundTransaction.status,
                    amount: refundTransaction.amount,
                    remark: refundTransaction.remark,
                    paymentType: refundTransaction.paymentType,
                    meta: refundTransaction.meta ?? null,
                    from: mapUser(receiver),
                    to: mapUser(requester),
                    createdAt: refundTransaction.createdAt,
                };
            });
        } finally {
            session.endSession();
        }

        const finalizedReceipt = receipt as UndoReceipt | null;
        const finalizedRequest = updatedRequest as IUndoRequest | null;
        if (!finalizedReceipt || !finalizedRequest) {
            throw new HttpError(500, "Failed to accept undo request");
        }

        const receiverName = receiver.fullName || receiver.phoneNumber;
        await Promise.all([
            this.notifyUndoLifecycle({
                userId: requester._id.toString(),
                action: "ACCEPTED",
                undoRequestId: finalizedRequest._id.toString(),
                originalTxId: originalTransaction.txId,
                transactionId: originalTransaction._id.toString(),
                amount: finalizedRequest.amount,
                requester,
                receiver,
                refundTxId: finalizedReceipt.txId,
                title: "Undo Accepted",
                body: `${receiverName} accepted your undo request of Rs. ${formatAmount(finalizedRequest.amount)}`,
            }),
            this.notifyPaymentSuccess({
                userId: receiver._id.toString(),
                title: "Payment Successful",
                body: `Undo refund of Rs. ${formatAmount(normalizedAmount)} successful`,
                txId: finalizedReceipt.txId,
                amount: normalizedAmount,
                direction: "DEBIT",
                counterpartyId: requester._id.toString(),
            }),
            this.notifyPaymentSuccess({
                userId: requester._id.toString(),
                title: "Amount Received",
                body: `You received Rs. ${formatAmount(normalizedAmount)} as undo refund from ${receiverName}`,
                txId: finalizedReceipt.txId,
                amount: normalizedAmount,
                direction: "CREDIT",
                counterpartyId: receiver._id.toString(),
            }),
        ]);

        return {
            request: this.mapUndoRequest(
                finalizedRequest,
                new Map<string, IUser>([
                    [requester._id.toString(), requester],
                    [receiver._id.toString(), receiver],
                ]),
                originalTransaction.txId
            ),
            receipt: finalizedReceipt,
        };
    }

    async rejectUndoRequest(userId: string, requestId: string) {
        const request = await this.getRequestOrThrow(requestId);

        if (request.receiver.toString() !== userId) {
            throw new HttpError(404, "Undo request not found");
        }

        const requester = await userRepository.getUserById(request.requester.toString());
        const receiver = await userRepository.getUserById(request.receiver.toString());
        if (!requester || !receiver) {
            throw new HttpError(404, "User not found");
        }

        const originalTransaction = await transactionRepository.getById(request.transactionId.toString());
        if (!originalTransaction) {
            throw new HttpError(500, "Original transaction not found");
        }

        if (request.status === "DENIED") {
            return this.mapUndoRequest(
                request,
                new Map<string, IUser>([
                    [requester._id.toString(), requester],
                    [receiver._id.toString(), receiver],
                ]),
                originalTransaction.txId
            );
        }

        if (request.status === "ACCEPTED") {
            throw new HttpError(409, "Undo request already accepted");
        }

        if (request.status !== "PENDING") {
            throw new HttpError(409, `Undo request already ${(request.status as string).toLowerCase()}`);
        }

        const updatedRequest = await undoRequestRepository.markDeniedIfPending(request._id.toString());
        if (!updatedRequest) {
            throw new HttpError(409, "Undo request already processed");
        }

        const receiverName = receiver.fullName || receiver.phoneNumber;
        await this.notifyUndoLifecycle({
            userId: requester._id.toString(),
            action: "DENIED",
            undoRequestId: updatedRequest._id.toString(),
            originalTxId: originalTransaction.txId,
            transactionId: originalTransaction._id.toString(),
            amount: updatedRequest.amount,
            requester,
            receiver,
            title: "Undo Denied",
            body: `${receiverName} denied your undo request of Rs. ${formatAmount(updatedRequest.amount)}`,
        });

        return this.mapUndoRequest(
            updatedRequest,
            new Map<string, IUser>([
                [requester._id.toString(), requester],
                [receiver._id.toString(), receiver],
            ]),
            originalTransaction.txId
        );
    }
}

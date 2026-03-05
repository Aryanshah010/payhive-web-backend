import mongoose, { ClientSession } from "mongoose";
import { IMoneyRequest, MoneyRequestModel } from "../models/money-request.model";
import { MoneyRequestStatus } from "../types/money-request.type";

interface MoneyRequestListParams {
    userId: string;
    role: "incoming" | "outgoing";
    skip: number;
    limit: number;
    status?: MoneyRequestStatus;
}

export interface IMoneyRequestRepository {
    createRequest(data: Partial<IMoneyRequest>, session?: ClientSession): Promise<IMoneyRequest>;
    getById(requestId: string): Promise<IMoneyRequest | null>;
    listByUser(params: MoneyRequestListParams): Promise<{ items: IMoneyRequest[]; total: number }>;
    expirePendingForUser(userId: string): Promise<number>;
    expireByIdIfPending(requestId: string, now?: Date): Promise<IMoneyRequest | null>;
    markStatusIfPending(
        requestId: string,
        status: Extract<MoneyRequestStatus, "REJECTED" | "CANCELED">,
        now?: Date
    ): Promise<IMoneyRequest | null>;
    markAcceptedIfPending(
        requestId: string,
        transactionId: mongoose.Types.ObjectId,
        session?: ClientSession,
        now?: Date
    ): Promise<IMoneyRequest | null>;
}

export class MoneyRequestRepository implements IMoneyRequestRepository {
    async createRequest(data: Partial<IMoneyRequest>, session?: ClientSession): Promise<IMoneyRequest> {
        const request = new MoneyRequestModel(data);
        return request.save(session ? { session } : {});
    }

    async getById(requestId: string): Promise<IMoneyRequest | null> {
        return MoneyRequestModel.findById(requestId);
    }

    async listByUser({
        userId,
        role,
        skip,
        limit,
        status,
    }: MoneyRequestListParams): Promise<{ items: IMoneyRequest[]; total: number }> {
        const participantKey = role === "incoming" ? "receiver" : "requester";
        const query: Record<string, unknown> = {
            [participantKey]: new mongoose.Types.ObjectId(userId),
        };

        if (status) {
            query.status = status;
        }

        const [items, total] = await Promise.all([
            MoneyRequestModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            MoneyRequestModel.countDocuments(query),
        ]);

        return { items, total };
    }

    async expirePendingForUser(userId: string): Promise<number> {
        const now = new Date();
        const result = await MoneyRequestModel.updateMany(
            {
                status: "PENDING",
                expiresAt: { $lt: now },
                $or: [
                    { requester: new mongoose.Types.ObjectId(userId) },
                    { receiver: new mongoose.Types.ObjectId(userId) },
                ],
            },
            {
                $set: {
                    status: "EXPIRED",
                    respondedAt: now,
                },
            }
        );

        return result.modifiedCount ?? 0;
    }

    async expireByIdIfPending(requestId: string, now: Date = new Date()): Promise<IMoneyRequest | null> {
        return MoneyRequestModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(requestId),
                status: "PENDING",
                expiresAt: { $lt: now },
            },
            {
                $set: {
                    status: "EXPIRED",
                    respondedAt: now,
                },
            },
            { new: true }
        );
    }

    async markStatusIfPending(
        requestId: string,
        status: Extract<MoneyRequestStatus, "REJECTED" | "CANCELED">,
        now: Date = new Date()
    ): Promise<IMoneyRequest | null> {
        return MoneyRequestModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(requestId),
                status: "PENDING",
                expiresAt: { $gt: now },
            },
            {
                $set: {
                    status,
                    respondedAt: now,
                },
            },
            { new: true }
        );
    }

    async markAcceptedIfPending(
        requestId: string,
        transactionId: mongoose.Types.ObjectId,
        session?: ClientSession,
        now: Date = new Date()
    ): Promise<IMoneyRequest | null> {
        return MoneyRequestModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(requestId),
                status: "PENDING",
                expiresAt: { $gt: now },
            },
            {
                $set: {
                    status: "ACCEPTED",
                    respondedAt: now,
                    transactionId,
                },
            },
            { new: true, ...(session ? { session } : {}) }
        );
    }
}

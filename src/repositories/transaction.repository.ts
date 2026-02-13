import mongoose, { ClientSession } from "mongoose";
import { TransactionModel, ITransaction } from "../models/transaction.model";

export type TransactionHistoryFilterDirection = "all" | "debit" | "credit";
type TransactionHistoryItemDirection = "DEBIT" | "CREDIT";

interface TransactionHistoryUserSnapshot {
    id: string;
    fullName: string;
    phoneNumber: string;
}

export interface TransactionHistoryListItem {
    txId: string;
    status: string;
    amount: number;
    remark?: string;
    from: TransactionHistoryUserSnapshot;
    to: TransactionHistoryUserSnapshot;
    createdAt: Date;
    direction: TransactionHistoryItemDirection;
}

export interface TransactionHistoryListByUserParams {
    userId: string;
    skip: number;
    limit: number;
    search?: string;
    direction?: TransactionHistoryFilterDirection;
}

export interface ITransactionRepository {
    createTransaction(data: Partial<ITransaction>, session: ClientSession): Promise<ITransaction>;
    getAverageDebit(userId: string, sinceDate: Date): Promise<number>;
    getTotalDebitForDate(userId: string, date: Date): Promise<number>;
    getByIdempotencyKey(userId: string, idempotencyKey: string): Promise<ITransaction | null>;
    getByTxIdForUser(userId: string, txId: string): Promise<ITransaction | null>;
    listByUser(params: TransactionHistoryListByUserParams): Promise<{ items: TransactionHistoryListItem[]; total: number }>;
}

export class TransactionRepository implements ITransactionRepository {
    async createTransaction(data: Partial<ITransaction>, session: ClientSession): Promise<ITransaction> {
        const tx = new TransactionModel(data);
        return await tx.save({ session });
    }

    async getAverageDebit(userId: string, sinceDate: Date): Promise<number> {
        const result = await TransactionModel.aggregate([
            {
                $match: {
                    from: new mongoose.Types.ObjectId(userId),
                    status: "SUCCESS",
                    createdAt: { $gte: sinceDate },
                },
            },
            { $group: { _id: null, avgAmount: { $avg: "$amount" } } },
        ]);

        return result[0]?.avgAmount ?? 0;
    }

    async getTotalDebitForDate(userId: string, date: Date): Promise<number> {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const result = await TransactionModel.aggregate([
            {
                $match: {
                    from: new mongoose.Types.ObjectId(userId),
                    status: "SUCCESS",
                    createdAt: { $gte: startOfDay, $lte: endOfDay },
                },
            },
            { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
        ]);

        return result[0]?.totalAmount ?? 0;
    }

    async getByIdempotencyKey(userId: string, idempotencyKey: string): Promise<ITransaction | null> {
        return TransactionModel.findOne({
            from: new mongoose.Types.ObjectId(userId),
            idempotencyKey,
        });
    }

    async getByTxIdForUser(userId: string, txId: string): Promise<ITransaction | null> {
        return TransactionModel.findOne({
            txId,
            $or: [
                { from: new mongoose.Types.ObjectId(userId) },
                { to: new mongoose.Types.ObjectId(userId) },
            ],
        });
    }

    async listByUser({
        userId,
        skip,
        limit,
        search = "",
        direction = "all",
    }: TransactionHistoryListByUserParams) {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const normalizedSearch = search.trim();

        const baseStages = buildHistoryFilterStages({
            userObjectId,
            direction,
            search: normalizedSearch,
        });

        const itemsPipeline = [
            ...baseStages,
            { $sort: { createdAt: -1 as const } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    txId: 1,
                    status: 1,
                    amount: 1,
                    remark: 1,
                    createdAt: 1,
                    direction: 1,
                    from: {
                        id: {
                            $ifNull: [{ $toString: "$fromUser._id" }, { $toString: "$from" }],
                        },
                        fullName: { $ifNull: ["$fromUser.fullName", ""] },
                        phoneNumber: { $ifNull: ["$fromUser.phoneNumber", ""] },
                    },
                    to: {
                        id: {
                            $ifNull: [{ $toString: "$toUser._id" }, { $toString: "$to" }],
                        },
                        fullName: { $ifNull: ["$toUser.fullName", ""] },
                        phoneNumber: { $ifNull: ["$toUser.phoneNumber", ""] },
                    },
                },
            },
        ];

        const countPipeline = [...baseStages, { $count: "total" }];

        const [items, countResult] = await Promise.all([
            TransactionModel.aggregate<TransactionHistoryListItem>(
                itemsPipeline as unknown as mongoose.PipelineStage[]
            ),
            TransactionModel.aggregate<{ total: number }>(
                countPipeline as unknown as mongoose.PipelineStage[]
            ),
        ]);

        const total = countResult[0]?.total ?? 0;
        return { items, total };
    }
}

interface BuildHistoryFilterStagesParams {
    userObjectId: mongoose.Types.ObjectId;
    direction: TransactionHistoryFilterDirection;
    search: string;
}

const buildHistoryFilterStages = ({
    userObjectId,
    direction,
    search,
}: BuildHistoryFilterStagesParams): Record<string, unknown>[] => {
    const stages: Record<string, unknown>[] = [
        {
            $match: {
                $or: [{ from: userObjectId }, { to: userObjectId }],
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "from",
                foreignField: "_id",
                as: "fromUser",
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "to",
                foreignField: "_id",
                as: "toUser",
            },
        },
        {
            $unwind: {
                path: "$fromUser",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $unwind: {
                path: "$toUser",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $addFields: {
                direction: {
                    $cond: [{ $eq: ["$from", userObjectId] }, "DEBIT", "CREDIT"],
                },
                counterpartyPhone: {
                    $cond: [
                        { $eq: ["$from", userObjectId] },
                        { $ifNull: ["$toUser.phoneNumber", ""] },
                        { $ifNull: ["$fromUser.phoneNumber", ""] },
                    ],
                },
            },
        },
    ];

    if (direction === "debit") {
        stages.push({ $match: { direction: "DEBIT" } });
    } else if (direction === "credit") {
        stages.push({ $match: { direction: "CREDIT" } });
    }

    if (search.length > 0) {
        const escapedSearch = escapeRegex(search);
        stages.push({
            $match: {
                $or: [
                    { remark: { $regex: escapedSearch, $options: "i" } },
                    { counterpartyPhone: { $regex: escapedSearch, $options: "i" } },
                ],
            },
        });
    }

    return stages;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

import mongoose, { ClientSession } from "mongoose";
import { TransactionModel, ITransaction } from "../models/transaction.model";

export interface ITransactionRepository {
    createTransaction(data: Partial<ITransaction>, session: ClientSession): Promise<ITransaction>;
    getAverageDebit(userId: string, sinceDate: Date): Promise<number>;
    getTotalDebitForDate(userId: string, date: Date): Promise<number>;
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
}

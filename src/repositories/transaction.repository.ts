import mongoose, { ClientSession } from "mongoose";
import { TransactionModel, ITransaction } from "../models/transaction.model";

export interface ITransactionRepository {
    createTransaction(data: Partial<ITransaction>, session: ClientSession): Promise<ITransaction>;
    getAverageDebit(userId: string, sinceDate: Date): Promise<number>;
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
}

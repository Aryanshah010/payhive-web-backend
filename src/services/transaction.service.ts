import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../repositories/user.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { HttpError } from "../errors/http-error";
import { IUser } from "../models/user.model";

let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const mapUser = (user: IUser) => ({
    id: user._id,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
});

export class TransactionService {
    async previewTransfer(userId: string, toPhoneNumber: string, amount: number, remark?: string) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        const toUser = await userRepository.getUserByPhoneNumber(toPhoneNumber);
        if (!toUser) throw new HttpError(404, "Recipient not found");

        if (fromUser._id.toString() === toUser._id.toString()) {
            throw new HttpError(400, "Cannot send money to yourself");
        }

        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && amount > 2 * avg, avg30d: avg };

        return {
            from: mapUser(fromUser),
            to: mapUser(toUser),
            amount,
            remark,
            warning,
        };
    }

    async confirmTransfer(userId: string, toPhoneNumber: string, amount: number, remark: string | undefined, pin: string) {
        const fromUser = await userRepository.getUserById(userId);
        if (!fromUser) throw new HttpError(404, "User not found");

        if (!fromUser.pinHash) {
            throw new HttpError(400, "PIN not set");
        }

        const validPin = await bcryptjs.compare(pin, fromUser.pinHash);
        if (!validPin) throw new HttpError(401, "Invalid PIN");

        const toUser = await userRepository.getUserByPhoneNumber(toPhoneNumber);
        if (!toUser) throw new HttpError(404, "Recipient not found");

        if (fromUser._id.toString() === toUser._id.toString()) {
            throw new HttpError(400, "Cannot send money to yourself");
        }

        const sinceDate = new Date(Date.now() - THIRTY_DAYS_MS);
        const avg = await transactionRepository.getAverageDebit(fromUser._id.toString(), sinceDate);
        const warning = { largeAmount: avg > 0 && amount > 2 * avg, avg30d: avg };

        const session = await mongoose.startSession();
        let receipt: any;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(fromUser._id.toString(), amount, session);
                if (!debited) {
                    throw new HttpError(400, "Insufficient balance");
                }

                const credited = await userRepository.creditUser(toUser._id.toString(), amount, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit recipient");
                }

                const tx = await transactionRepository.createTransaction(
                    {
                        from: fromUser._id,
                        to: toUser._id,
                        amount,
                        remark: remark || "",
                        status: "SUCCESS",
                        txId: uuidv4(),
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
}

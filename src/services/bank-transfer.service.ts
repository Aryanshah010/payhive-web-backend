import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { BANK_CLEARING_ACCOUNT_USER_ID, BANK_TRANSFER_FIXED_FEE } from "../configs";
import { HttpError } from "../errors/http-error";
import { BankTransferRepository } from "../repositories/bank-transfer.repository";
import { BankRepository } from "../repositories/bank.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UserRepository } from "../repositories/user.repository";

let bankRepository = new BankRepository();
let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();
let bankTransferRepository = new BankTransferRepository();

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;

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

export class BankTransferService {
    async transferToBank(
        userId: string,
        bankId: string,
        accountNumber: string,
        amount: number,
        remark?: string
    ) {
        if (!mongoose.Types.ObjectId.isValid(bankId)) {
            throw new HttpError(400, "Invalid bank", { code: "INVALID_BANK" });
        }

        const bank = await bankRepository.getById(bankId);
        if (!bank || !bank.isActive) {
            throw new HttpError(400, "Invalid bank", { code: "INVALID_BANK" });
        }

        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount <= 0) {
            throw new HttpError(400, "Invalid amount", { code: "INVALID_AMOUNT" });
        }

        if (normalizedAmount < bank.minTransfer || normalizedAmount > bank.maxTransfer) {
            throw new HttpError(400, "Invalid amount", { code: "INVALID_AMOUNT" });
        }

        const accountRegex = parseBankAccountRegex(bank.accountNumberRegex);
        const trimmedAccountNumber = accountNumber.trim();
        if (!accountRegex.test(trimmedAccountNumber)) {
            throw new HttpError(400, "Invalid account number", { code: "INVALID_ACCOUNT_NUMBER" });
        }

        if (!BANK_CLEARING_ACCOUNT_USER_ID) {
            throw new HttpError(500, "Bank clearing account is not configured", {
                code: "CLEARING_ACCOUNT_NOT_CONFIGURED",
            });
        }

        const clearingAccount = await userRepository.getUserById(BANK_CLEARING_ACCOUNT_USER_ID);
        if (!clearingAccount) {
            throw new HttpError(500, "Bank clearing account does not exist", {
                code: "CLEARING_ACCOUNT_NOT_CONFIGURED",
            });
        }

        if (clearingAccount._id.toString() === userId) {
            throw new HttpError(400, "Sender and receiver cannot be the same", {
                code: "INVALID_BANK",
            });
        }

        const fee = BANK_TRANSFER_FIXED_FEE;
        const totalDebited = normalizeAmount(normalizedAmount + fee);
        const maskedAccount = maskAccountNumber(trimmedAccountNumber);

        const session = await mongoose.startSession();

        let createdTransaction: { _id: mongoose.Types.ObjectId; txId: string; createdAt: Date } | null = null;
        let createdTransfer: {
            _id: mongoose.Types.ObjectId;
            status: string;
            createdAt: Date;
        } | null = null;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(userId, totalDebited, session);
                if (!debited) {
                    throw new HttpError(402, "Insufficient funds", { code: "INSUFFICIENT_FUNDS" });
                }

                const credited = await userRepository.creditUser(clearingAccount._id.toString(), totalDebited, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit clearing account", { code: "INTERNAL_ERROR" });
                }

                const tx = await transactionRepository.createTransaction(
                    {
                        from: new mongoose.Types.ObjectId(userId),
                        to: clearingAccount._id,
                        amount: totalDebited,
                        remark: remark?.trim() || `Bank transfer to ${bank.code}`,
                        status: "SUCCESS",
                        txId: uuidv4(),
                        paymentType: "BANK_TRANSFER",
                        meta: {
                            type: "bank_transfer",
                            receiverId: "bank_clearing_account",
                            bankId: bank._id.toString(),
                            bankName: bank.name,
                            bankCode: bank.code,
                            maskedAccount,
                            accountNumberMasked: maskedAccount,
                            accountNumber: maskedAccount,
                            amount: normalizedAmount,
                            fee,
                            totalDebited,
                            status: "completed",
                        },
                    },
                    session
                );

                const transfer = await bankTransferRepository.createTransfer(
                    {
                        userId: new mongoose.Types.ObjectId(userId),
                        bankId: bank._id,
                        accountNumberMasked: maskedAccount,
                        amount: normalizedAmount,
                        fee,
                        totalDebited,
                        status: "completed",
                        transactionId: tx._id,
                    },
                    session
                );

                createdTransaction = {
                    _id: tx._id as mongoose.Types.ObjectId,
                    txId: tx.txId,
                    createdAt: tx.createdAt,
                };

                createdTransfer = {
                    _id: transfer._id as mongoose.Types.ObjectId,
                    status: transfer.status,
                    createdAt: transfer.createdAt,
                };
            });
        } finally {
            session.endSession();
        }

        if (!createdTransaction || !createdTransfer) {
            throw new HttpError(500, "Bank transfer failed", { code: "INTERNAL_ERROR" });
        }

        const transfer = createdTransfer as {
            _id: mongoose.Types.ObjectId;
            status: string;
            createdAt: Date;
        };
        const transaction = createdTransaction as {
            _id: mongoose.Types.ObjectId;
            txId: string;
            createdAt: Date;
        };

        return {
            transferId: transfer._id,
            transactionId: transaction._id,
            txId: transaction.txId,
            bank: {
                id: bank._id,
                name: bank.name,
                code: bank.code,
            },
            amount: normalizedAmount,
            fee,
            totalDebited,
            status: transfer.status,
            accountNumberMasked: maskedAccount,
            createdAt: transfer.createdAt,
        };
    }
}

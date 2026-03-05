import mongoose, { Document, Schema } from "mongoose";

export type BankTransferStatus = "processing" | "completed" | "failed";

const bankTransferSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        bankId: { type: Schema.Types.ObjectId, ref: "Bank", required: true, index: true },
        accountNumberMasked: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        fee: { type: Number, required: true, min: 0 },
        totalDebited: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ["processing", "completed", "failed"],
            default: "completed",
            required: true,
        },
        transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
    },
    {
        timestamps: true,
    }
);

bankTransferSchema.index({ userId: 1, createdAt: -1 });

export interface IBankTransfer extends Document {
    userId: mongoose.Types.ObjectId;
    bankId: mongoose.Types.ObjectId;
    accountNumberMasked: string;
    amount: number;
    fee: number;
    totalDebited: number;
    status: BankTransferStatus;
    transactionId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export const BankTransferModel = mongoose.model<IBankTransfer>("BankTransfer", bankTransferSchema);

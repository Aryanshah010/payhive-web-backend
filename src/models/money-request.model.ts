import mongoose, { Document, Schema } from "mongoose";
import { MONEY_REQUEST_STATUSES, MoneyRequestStatus } from "../types/money-request.type";

const moneyRequestSchema: Schema = new Schema(
    {
        requester: { type: Schema.Types.ObjectId, ref: "User", required: true },
        receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true },
        remark: { type: String, default: "" },
        status: { type: String, enum: MONEY_REQUEST_STATUSES, default: "PENDING", required: true },
        expiresAt: { type: Date, required: true },
        respondedAt: { type: Date, default: null },
        transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    },
    {
        timestamps: true,
    }
);

moneyRequestSchema.index({ receiver: 1, status: 1, createdAt: -1 });
moneyRequestSchema.index({ requester: 1, status: 1, createdAt: -1 });
moneyRequestSchema.index({ status: 1, expiresAt: 1 });

export interface IMoneyRequest extends Document {
    requester: mongoose.Types.ObjectId;
    receiver: mongoose.Types.ObjectId;
    amount: number;
    remark: string;
    status: MoneyRequestStatus;
    expiresAt: Date;
    respondedAt?: Date | null;
    transactionId?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const MoneyRequestModel = mongoose.model<IMoneyRequest>("MoneyRequest", moneyRequestSchema);

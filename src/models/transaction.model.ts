import mongoose, { Document, Schema } from "mongoose";

export type TransactionStatus = "SUCCESS" | "FAILED" | "PENDING";

const transactionSchema: Schema = new Schema(
    {
        from: { type: Schema.Types.ObjectId, ref: "User", required: true },
        to: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true },
        remark: { type: String, default: "" },
        status: { type: String, enum: ["SUCCESS", "FAILED", "PENDING"], default: "SUCCESS" },
        txId: { type: String, required: true, unique: true },
        idempotencyKey: { type: String, required: false },
    },
    {
        timestamps: true,
    }
);

transactionSchema.index({ from: 1, createdAt: -1 });
transactionSchema.index(
    { from: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export interface ITransaction extends Document {
    from: mongoose.Types.ObjectId;
    to: mongoose.Types.ObjectId;
    amount: number;
    remark?: string;
    status: TransactionStatus;
    txId: string;
    idempotencyKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

export const TransactionModel = mongoose.model<ITransaction>("Transaction", transactionSchema);

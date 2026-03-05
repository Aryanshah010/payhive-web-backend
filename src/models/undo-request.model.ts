import mongoose, { Document, Schema } from "mongoose";
import { UNDO_REQUEST_STATUSES, UndoRequestStatus } from "../types/undo-request.type";

const undoRequestSchema: Schema = new Schema(
    {
        transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true, unique: true },
        requester: { type: Schema.Types.ObjectId, ref: "User", required: true },
        receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true },
        status: { type: String, enum: UNDO_REQUEST_STATUSES, default: "PENDING", required: true },
        refundTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
        respondedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

undoRequestSchema.index({ receiver: 1, status: 1, createdAt: -1 });

export interface IUndoRequest extends Document {
    transactionId: mongoose.Types.ObjectId;
    requester: mongoose.Types.ObjectId;
    receiver: mongoose.Types.ObjectId;
    amount: number;
    status: UndoRequestStatus;
    refundTransactionId?: mongoose.Types.ObjectId | null;
    respondedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const UndoRequestModel = mongoose.model<IUndoRequest>("UndoRequest", undoRequestSchema);

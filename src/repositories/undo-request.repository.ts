import mongoose, { ClientSession } from "mongoose";
import { IUndoRequest, UndoRequestModel } from "../models/undo-request.model";

export interface IUndoRequestRepository {
    createRequest(data: Partial<IUndoRequest>, session?: ClientSession): Promise<IUndoRequest>;
    getById(requestId: string): Promise<IUndoRequest | null>;
    markAcceptedIfPending(
        requestId: string,
        refundTransactionId: mongoose.Types.ObjectId,
        session?: ClientSession,
        now?: Date
    ): Promise<IUndoRequest | null>;
    markDeniedIfPending(requestId: string, now?: Date): Promise<IUndoRequest | null>;
}

export class UndoRequestRepository implements IUndoRequestRepository {
    async createRequest(data: Partial<IUndoRequest>, session?: ClientSession): Promise<IUndoRequest> {
        const request = new UndoRequestModel(data);
        return request.save(session ? { session } : {});
    }

    async getById(requestId: string): Promise<IUndoRequest | null> {
        return UndoRequestModel.findById(requestId);
    }

    async markAcceptedIfPending(
        requestId: string,
        refundTransactionId: mongoose.Types.ObjectId,
        session?: ClientSession,
        now: Date = new Date()
    ): Promise<IUndoRequest | null> {
        return UndoRequestModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(requestId),
                status: "PENDING",
            },
            {
                $set: {
                    status: "ACCEPTED",
                    refundTransactionId,
                    respondedAt: now,
                },
            },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    async markDeniedIfPending(requestId: string, now: Date = new Date()): Promise<IUndoRequest | null> {
        return UndoRequestModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(requestId),
                status: "PENDING",
            },
            {
                $set: {
                    status: "DENIED",
                    respondedAt: now,
                },
            },
            { new: true }
        );
    }
}

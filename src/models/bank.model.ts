import mongoose, { Document, Schema } from "mongoose";

const bankSchema: Schema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, trim: true, uppercase: true, unique: true },
        accountNumberRegex: { type: String, required: true, trim: true },
        isActive: { type: Boolean, default: true },
        minTransfer: { type: Number, required: true, min: 0 },
        maxTransfer: { type: Number, required: true, min: 0 },
    },
    {
        timestamps: true,
    }
);

bankSchema.index({ isActive: 1, name: 1 });

export interface IBank extends Document {
    name: string;
    code: string;
    accountNumberRegex: string;
    isActive: boolean;
    minTransfer: number;
    maxTransfer: number;
    createdAt: Date;
    updatedAt: Date;
}

export const BankModel = mongoose.model<IBank>("Bank", bankSchema);

import mongoose, { Document, Schema } from "mongoose";

export type UtilityType = "internet" | "topup";

const utilitySchema: Schema = new Schema(
    {
        type: { type: String, enum: ["internet", "topup"], required: true, index: true },
        provider: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        packageLabel: { type: String, required: false, trim: true, default: "" },
        amount: { type: Number, required: true, min: 0 },
        validationRegex: { type: String, required: false, trim: true, default: "" },
        isActive: { type: Boolean, default: true },
        meta: { type: Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: true,
    }
);

utilitySchema.index({ type: 1, provider: 1, isActive: 1 });
utilitySchema.index({ type: 1, name: 1, packageLabel: 1 });
utilitySchema.index({ type: 1, provider: 1, name: 1, packageLabel: 1 }, { unique: true });

export interface IUtility extends Document {
    type: UtilityType;
    provider: string;
    name: string;
    packageLabel?: string;
    amount: number;
    validationRegex?: string;
    isActive: boolean;
    meta?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export const UtilityModel = mongoose.model<IUtility>("Utility", utilitySchema);

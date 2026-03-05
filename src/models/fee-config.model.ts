import mongoose, { Document, Schema } from "mongoose";

export type FeeConfigType = "service_payment";
export type FeeCalculationMode = "fixed";
export type FeeAppliesTo = "flight" | "hotel" | "internet" | "topup" | "recharge";

const feeConfigSchema: Schema = new Schema(
    {
        type: {
            type: String,
            enum: ["service_payment"],
            required: true,
            index: true,
        },
        description: { type: String, required: true, trim: true },
        calculation: {
            mode: { type: String, enum: ["fixed"], required: true },
            fixedAmount: { type: Number, required: true, min: 0 },
        },
        appliesTo: {
            type: [String],
            enum: ["flight", "hotel", "internet", "topup", "recharge"],
            required: true,
        },
        isActive: { type: Boolean, default: true },
    },
    {
        timestamps: true,
    }
);

feeConfigSchema.index({ type: 1, appliesTo: 1, isActive: 1 });

export interface IFeeConfig extends Document {
    type: FeeConfigType;
    description: string;
    calculation: {
        mode: FeeCalculationMode;
        fixedAmount: number;
    };
    appliesTo: FeeAppliesTo[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const FeeConfigModel = mongoose.model<IFeeConfig>("FeeConfig", feeConfigSchema);

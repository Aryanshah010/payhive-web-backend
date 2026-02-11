import mongoose, { Document, Schema } from "mongoose";

export type DeviceStatus = "ALLOWED" | "PENDING" | "BLOCKED";

const deviceSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        deviceId: { type: String, required: true },
        deviceName: { type: String, required: false, default: null },
        userAgent: { type: String, required: false, default: null },
        status: {
            type: String,
            enum: ["ALLOWED", "PENDING", "BLOCKED"],
            required: true,
            default: "PENDING",
            index: true,
        },
        lastSeenAt: { type: Date, required: false, default: null },
        allowedAt: { type: Date, required: false, default: null },
        blockedAt: { type: Date, required: false, default: null },
    },
    {
        timestamps: true,
    }
);

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceSchema.index({ userId: 1, status: 1 });

export interface IDevice extends Document {
    userId: mongoose.Types.ObjectId;
    deviceId: string;
    deviceName?: string | null;
    userAgent?: string | null;
    status: DeviceStatus;
    lastSeenAt?: Date | null;
    allowedAt?: Date | null;
    blockedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const DeviceModel = mongoose.model<IDevice>("Device", deviceSchema);

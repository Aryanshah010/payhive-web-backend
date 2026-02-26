import mongoose, { Document, Schema } from "mongoose";
import { NOTIFICATION_TYPES, NotificationType } from "../types/notification.type";

const notificationSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        title: { type: String, required: true, trim: true },
        body: { type: String, required: true, trim: true },
        type: { type: String, enum: NOTIFICATION_TYPES, required: true },
        data: { type: Schema.Types.Mixed, required: false, default: null },
        isRead: { type: Boolean, required: true, default: false },
        readAt: { type: Date, required: false, default: null },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    body: string;
    type: NotificationType;
    data?: Record<string, unknown> | null;
    isRead: boolean;
    readAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export const NotificationModel = mongoose.model<INotification>("Notification", notificationSchema);

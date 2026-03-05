import mongoose from "mongoose";
import { INotification, NotificationModel } from "../models/notification.model";
import { NotificationType } from "../types/notification.type";

export interface NotificationListParams {
    userId: string;
    skip: number;
    limit: number;
    isRead?: boolean;
    type?: NotificationType;
}

export interface INotificationRepository {
    createNotification(data: Partial<INotification>): Promise<INotification>;
    listByUser(params: NotificationListParams): Promise<{ items: INotification[]; total: number }>;
    countUnreadByUser(userId: string): Promise<number>;
    markReadById(userId: string, notificationId: string): Promise<INotification | null>;
    markAllRead(userId: string): Promise<number>;
}

export class NotificationRepository implements INotificationRepository {
    async createNotification(data: Partial<INotification>): Promise<INotification> {
        const notification = new NotificationModel(data);
        return notification.save();
    }

    async listByUser({ userId, skip, limit, isRead, type }: NotificationListParams) {
        const query: Record<string, unknown> = {
            userId: new mongoose.Types.ObjectId(userId),
        };

        if (typeof isRead === "boolean") {
            query.isRead = isRead;
        }

        if (type) {
            query.type = type;
        }

        const [items, total] = await Promise.all([
            NotificationModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            NotificationModel.countDocuments(query),
        ]);

        return { items, total };
    }

    async countUnreadByUser(userId: string): Promise<number> {
        return NotificationModel.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
            isRead: false,
        });
    }

    async markReadById(userId: string, notificationId: string): Promise<INotification | null> {
        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            return null;
        }

        return NotificationModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(notificationId),
                userId: new mongoose.Types.ObjectId(userId),
            },
            {
                isRead: true,
                readAt: new Date(),
            },
            { new: true }
        );
    }

    async markAllRead(userId: string): Promise<number> {
        const result = await NotificationModel.updateMany(
            {
                userId: new mongoose.Types.ObjectId(userId),
                isRead: false,
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date(),
                },
            }
        );

        return result.modifiedCount;
    }
}

import mongoose from "mongoose";
import { HttpError } from "../errors/http-error";
import { INotification } from "../models/notification.model";
import { DeviceRepository } from "../repositories/device.repository";
import { NotificationRepository } from "../repositories/notification.repository";
import { NotificationListQueryType, NotificationType } from "../types/notification.type";
import { FcmService } from "./fcm.service";

let notificationRepository = new NotificationRepository();
let deviceRepository = new DeviceRepository();
let fcmService = new FcmService();

interface CreateNotificationInput {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    data?: Record<string, unknown>;
}

const mapNotification = (notification: INotification) => ({
    id: notification._id.toString(),
    userId: notification.userId.toString(),
    title: notification.title,
    body: notification.body,
    type: notification.type,
    data: notification.data ?? null,
    isRead: notification.isRead,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
});

const normalizeData = (data?: Record<string, unknown>) => data || {};

export class NotificationService {
    async createNotification(input: CreateNotificationInput) {
        if (!mongoose.Types.ObjectId.isValid(input.userId)) {
            throw new HttpError(400, "Invalid userId");
        }

        const notification = await notificationRepository.createNotification({
            userId: new mongoose.Types.ObjectId(input.userId),
            title: input.title,
            body: input.body,
            type: input.type,
            data: input.data ?? null,
            isRead: false,
        });

        const tokens = await deviceRepository.listFcmTokensByUser(input.userId);
        if (tokens.length > 0) {
            const fcmData: Record<string, unknown> = {
                notificationId: notification._id.toString(),
                type: notification.type,
                ...normalizeData(input.data),
            };

            try {
                await fcmService.sendToTokens(tokens, {
                    title: notification.title,
                    body: notification.body,
                    data: fcmData,
                });
            } catch (error) {
                console.error("Failed to send push notification:", error);
            }
        }

        return mapNotification(notification);
    }

    async listUserNotifications(userId: string, query: NotificationListQueryType) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new HttpError(400, "Invalid userId");
        }

        const page = Math.max(1, query.page);
        const limit = Math.max(1, Math.min(query.limit, 50));
        const skip = (page - 1) * limit;

        const [{ items, total }, unreadCount] = await Promise.all([
            notificationRepository.listByUser({
                userId,
                skip,
                limit,
                isRead: query.isRead,
                type: query.type,
            }),
            notificationRepository.countUnreadByUser(userId),
        ]);

        return {
            items: items.map(mapNotification),
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            unreadCount,
        };
    }

    async markRead(userId: string, notificationId: string) {
        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            throw new HttpError(400, "Invalid notification ID");
        }

        const updated = await notificationRepository.markReadById(userId, notificationId);
        if (!updated) {
            throw new HttpError(404, "Notification not found");
        }

        return mapNotification(updated);
    }

    async markAllRead(userId: string) {
        const modifiedCount = await notificationRepository.markAllRead(userId);
        return { modifiedCount };
    }
}

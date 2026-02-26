import { Request, Response } from "express";
import z from "zod";
import { NotificationCreateDto, NotificationListQueryDto } from "../dtos/notification.dto";
import { NotificationService } from "../services/notification.service";

let notificationService = new NotificationService();

export class NotificationController {
    async createInternal(req: Request, res: Response) {
        try {
            const parsedBody = NotificationCreateDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await notificationService.createNotification(parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Notification created",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async list(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            const parsedQuery = NotificationListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const data = await notificationService.listUserNotifications(
                userId.toString(),
                parsedQuery.data
            );

            return res.status(200).json({
                success: true,
                message: "Notifications fetched",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async markRead(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            const data = await notificationService.markRead(userId.toString(), req.params.id);
            return res.status(200).json({
                success: true,
                message: "Notification marked as read",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async markAllRead(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({ success: false, message: "Unauthorized" });
            }

            const data = await notificationService.markAllRead(userId.toString());
            return res.status(200).json({
                success: true,
                message: "All notifications marked as read",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }
}

import z from "zod";
import {
    NotificationCreateSchema,
    NotificationListQuerySchema,
    NotificationFcmTokenSchema,
} from "../types/notification.type";

export const NotificationCreateDto = NotificationCreateSchema;
export type NotificationCreateDto = z.infer<typeof NotificationCreateDto>;

export const NotificationListQueryDto = NotificationListQuerySchema;
export type NotificationListQueryDto = z.infer<typeof NotificationListQueryDto>;

export const NotificationFcmTokenDto = NotificationFcmTokenSchema;
export type NotificationFcmTokenDto = z.infer<typeof NotificationFcmTokenDto>;

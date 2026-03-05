import z from "zod";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const parsePositiveInt = (value: unknown, fallback: number) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.floor(value);
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const parseOptionalBoolean = (value: unknown) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }
    return undefined;
};

export const NOTIFICATION_TYPES = [
    "UNDO_REQUEST",
    "REQUEST_MONEY",
    "DEVICE_LOGIN",
    "PAYMENT_SUCCESS",
] as const;

export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationCreateSchema = z.object({
    userId: z.string().regex(OBJECT_ID_REGEX, "userId must be a valid ObjectId"),
    title: z.string().trim().min(1, "title is required").max(120, "title must be at most 120 characters"),
    body: z.string().trim().min(1, "body is required").max(500, "body must be at most 500 characters"),
    type: NotificationTypeSchema,
    data: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationCreateType = z.infer<typeof NotificationCreateSchema>;

export const NotificationListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    isRead: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
    type: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim().length > 0
                ? value.trim().toUpperCase()
                : undefined,
        NotificationTypeSchema.optional()
    ),
});

export type NotificationListQueryType = z.infer<typeof NotificationListQuerySchema>;

export const NotificationFcmTokenSchema = z.object({
    fcmToken: z.union([z.string().trim().min(10, "fcmToken is invalid"), z.null()]),
});

export type NotificationFcmTokenType = z.infer<typeof NotificationFcmTokenSchema>;

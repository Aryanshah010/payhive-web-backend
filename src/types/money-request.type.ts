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

export const MONEY_REQUEST_STATUSES = [
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "CANCELED",
    "EXPIRED",
] as const;

export type MoneyRequestStatus = (typeof MONEY_REQUEST_STATUSES)[number];

export const MONEY_REQUEST_ACTIONS = ["CREATED", "REJECTED", "CANCELED", "EXPIRED"] as const;
export type MoneyRequestAction = (typeof MONEY_REQUEST_ACTIONS)[number];

export const MoneyRequestStatusSchema = z.enum(MONEY_REQUEST_STATUSES);
export const MoneyRequestActionSchema = z.enum(MONEY_REQUEST_ACTIONS);

export const MoneyRequestCreateSchema = z.object({
    toPhoneNumber: z
        .string()
        .regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)"),
    amount: z
        .number()
        .positive("Amount must be greater than 0")
        .refine((val) => Number.isInteger(val * 100), "Amount must have at most 2 decimal places"),
    remark: z.string().max(140, "Remark must be at most 140 characters").optional(),
});

export const MoneyRequestAcceptSchema = z.object({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
});

export const MoneyRequestStatusFilterSchema = z.enum([
    "all",
    "pending",
    "accepted",
    "rejected",
    "canceled",
    "expired",
]);

export const MoneyRequestListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    status: z
        .preprocess(
            (value) => (typeof value === "string" ? value.trim().toLowerCase() : "all"),
            MoneyRequestStatusFilterSchema
        )
        .default("all"),
});

export const MoneyRequestIdParamSchema = z.object({
    requestId: z.string().regex(OBJECT_ID_REGEX, "requestId must be a valid ObjectId"),
});

export type MoneyRequestCreateType = z.infer<typeof MoneyRequestCreateSchema>;
export type MoneyRequestAcceptType = z.infer<typeof MoneyRequestAcceptSchema>;
export type MoneyRequestListQueryType = z.infer<typeof MoneyRequestListQuerySchema>;
export type MoneyRequestIdParamType = z.infer<typeof MoneyRequestIdParamSchema>;

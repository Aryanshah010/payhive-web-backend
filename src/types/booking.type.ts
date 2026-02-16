import z from "zod";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const isFutureDateOnly = (value: string) => {
    const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() > today.getTime();
};

export const PassengerSchema = z.object({
    name: z.string().trim().min(1, "Passenger name is required"),
});

export const BookingCreateSchema = z.object({
    type: z.enum(["flight", "hotel"]),
    itemId: z.string().regex(OBJECT_ID_REGEX, "itemId must be a valid ObjectId"),
    quantity: z.number().int().positive().optional(),
    rooms: z.number().int().positive().optional(),
    nights: z.number().int().positive().optional(),
    checkin: z.string().regex(DATE_ONLY_REGEX, "checkin must be YYYY-MM-DD").optional(),
    passengers: z.array(PassengerSchema).max(10).optional(),
}).superRefine((value, ctx) => {
    if (value.type === "flight") {
        if (!value.quantity) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["quantity"],
                message: "quantity is required for flight bookings",
            });
        }
    }

    if (value.type === "hotel") {
        if (!value.rooms && !value.quantity) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["rooms"],
                message: "rooms is required for hotel bookings",
            });
        }
        if (!value.nights) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["nights"],
                message: "nights is required for hotel bookings",
            });
        }
        if (!value.checkin) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["checkin"],
                message: "checkin is required for hotel bookings",
            });
        } else if (!isFutureDateOnly(value.checkin)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["checkin"],
                message: "checkin date must be in the future",
            });
        }
    }
});

export type BookingCreateType = z.infer<typeof BookingCreateSchema>;

export const BookingPaySchema = z.object({
    confirm: z.boolean().optional(),
});

export type BookingPayType = z.infer<typeof BookingPaySchema>;

export const BookingListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    status: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        z.enum(["created", "paid", "cancelled", "refunded"]).optional()
    ),
    type: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        z.enum(["flight", "hotel"]).optional()
    ),
});

export type BookingListQueryType = z.infer<typeof BookingListQuerySchema>;

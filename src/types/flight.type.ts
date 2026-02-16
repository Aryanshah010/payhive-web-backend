import z from "zod";

const parseDate = (value: unknown) => {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }
    return value;
};

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

export const FlightSchema = z.object({
    airline: z.string().trim().min(2, "Airline is required"),
    flightNumber: z.string().trim().min(2, "Flight number is required"),
    from: z.string().trim().min(2, "From is required"),
    to: z.string().trim().min(2, "To is required"),
    departure: z.preprocess(parseDate, z.date("Departure must be a valid date")),
    arrival: z.preprocess(parseDate, z.date("Arrival must be a valid date")),
    durationMinutes: z.number().int().positive("Duration must be positive"),
    class: z.enum(["Economy", "Business"]),
    price: z.number().nonnegative("Price cannot be negative"),
    seatsTotal: z.number().int().positive("Seats total must be positive"),
    seatsAvailable: z.number().int().nonnegative("Seats available cannot be negative"),
    meta: z.record(z.string(), z.unknown()).optional().default({}),
}).superRefine((value, ctx) => {
    if (value.arrival <= value.departure) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["arrival"],
            message: "Arrival must be after departure",
        });
    }

    if (value.seatsAvailable > value.seatsTotal) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["seatsAvailable"],
            message: "Seats available cannot exceed seats total",
        });
    }
});

export type FlightType = z.infer<typeof FlightSchema>;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const FlightListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    from: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    to: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    date: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        DateOnlySchema.optional()
    ),
});

export type FlightListQueryType = z.infer<typeof FlightListQuerySchema>;

export const FlightAdminListQuerySchema = FlightListQuerySchema.extend({
    search: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    class: z.preprocess(
        (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
        z.enum(["Economy", "Business"]).optional()
    ),
});

export type FlightAdminListQueryType = z.infer<typeof FlightAdminListQuerySchema>;

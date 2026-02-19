import z from "zod";

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

export const HotelSchema = z.object({
    name: z.string().trim().min(2, "Name is required"),
    city: z.string().trim().min(2, "City is required"),
    roomType: z.string().trim().min(2, "Room type is required"),
    roomsTotal: z.number().int().positive("Rooms total must be positive"),
    roomsAvailable: z.number().int().nonnegative("Rooms available cannot be negative"),
    pricePerNight: z.number().nonnegative("Price per night cannot be negative"),
    amenities: z.array(z.string().trim().min(1)).default([]),
    images: z.array(z.string().trim().min(1)).default([]),
}).superRefine((value, ctx) => {
    if (value.roomsAvailable > value.roomsTotal) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["roomsAvailable"],
            message: "Rooms available cannot exceed rooms total",
        });
    }
});

export type HotelType = z.infer<typeof HotelSchema>;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const HotelListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    city: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    checkin: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        DateOnlySchema.optional()
    ),
    nights: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1).max(30)).default(1),
});

export type HotelListQueryType = z.infer<typeof HotelListQuerySchema>;

export const HotelAdminListQuerySchema = HotelListQuerySchema.extend({
    search: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
});

export type HotelAdminListQueryType = z.infer<typeof HotelAdminListQuerySchema>;

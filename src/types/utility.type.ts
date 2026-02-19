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

const parseBoolean = (value: unknown, fallback?: boolean) => {
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
    return fallback;
};

export const UtilityTypeSchema = z.enum(["internet", "topup"]);

export const UtilitySchema = z.object({
    provider: z.string().trim().min(2, "Provider is required"),
    name: z.string().trim().min(2, "Name is required"),
    packageLabel: z.string().trim().default(""),
    amount: z.number().positive("Amount must be greater than 0"),
    validationRegex: z.string().trim().default(""),
    isActive: z.boolean().default(true),
    meta: z.record(z.string(), z.unknown()).optional().default({}),
});

export type UtilityType = z.infer<typeof UtilitySchema>;

export const UtilityListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    provider: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    search: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()).default(""),
    isActive: z.preprocess((value) => parseBoolean(value), z.boolean().optional()),
});

export type UtilityListQueryType = z.infer<typeof UtilityListQuerySchema>;

export const InternetPaymentSchema = z.object({
    customerId: z.string().trim().min(3, "customerId is required"),
});

export type InternetPaymentType = z.infer<typeof InternetPaymentSchema>;

export const TopupPaymentSchema = z.object({
    phoneNumber: z.string().trim().regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits"),
});

export type TopupPaymentType = z.infer<typeof TopupPaymentSchema>;

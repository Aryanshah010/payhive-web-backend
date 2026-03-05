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

const hasTwoDecimals = (value: number) => Number.isInteger(value * 100);

export const FeeConfigTypeSchema = z.enum(["service_payment"]);
export const FeeAppliesToSchema = z.enum(["flight", "hotel", "internet", "topup", "recharge"]);
export const FeeCalculationModeSchema = z.enum(["fixed"]);

export const FeeCalculationSchema = z.object({
    mode: FeeCalculationModeSchema,
    fixedAmount: z
        .number()
        .min(0, "fixedAmount must be at least 0")
        .refine((val) => Number.isFinite(val) && hasTwoDecimals(val), {
            message: "fixedAmount must have at most 2 decimal places",
        }),
});

const uniqueAppliesTo = (values: string[]) => {
    const normalized = values.map((value) => (value === "recharge" ? "topup" : value));
    return new Set(normalized).size === normalized.length;
};

export const FeeConfigSchema = z.object({
    type: FeeConfigTypeSchema,
    description: z.string().trim().min(2, "Description is required"),
    calculation: FeeCalculationSchema,
    appliesTo: z
        .array(FeeAppliesToSchema)
        .min(1, "appliesTo must have at least one entry")
        .refine((values) => uniqueAppliesTo(values), {
            message: "appliesTo entries must be unique",
        }),
    isActive: z.boolean().default(true),
});

export type FeeConfigType = z.infer<typeof FeeConfigSchema>;

export const FeeConfigListQuerySchema = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    type: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        FeeConfigTypeSchema.optional()
    ),
    appliesTo: z.preprocess(
        (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
        FeeAppliesToSchema.optional()
    ),
    isActive: z.preprocess((value) => parseBoolean(value), z.boolean().optional()),
});

export type FeeConfigListQueryType = z.infer<typeof FeeConfigListQuerySchema>;

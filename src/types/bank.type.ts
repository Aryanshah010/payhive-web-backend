import z from "zod";

const hasTwoOrFewerDecimals = (value: number) => Number.isInteger(value * 100);

const amountSchema = z
    .number()
    .positive("Amount must be greater than 0")
    .refine(hasTwoOrFewerDecimals, "Amount must have at most 2 decimal places");

const canCompileRegex = (pattern: string) => {
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
};

export const BankSchema = z
    .object({
        name: z.string().trim().min(2, "Bank name is required"),
        code: z
            .string()
            .trim()
            .min(2, "Bank code is required")
            .max(20, "Bank code is too long")
            .regex(/^[A-Za-z0-9_-]+$/, "Bank code can only contain letters, numbers, _ and -"),
        accountNumberRegex: z
            .string()
            .trim()
            .min(1, "accountNumberRegex is required")
            .refine((value) => canCompileRegex(value), "accountNumberRegex is invalid"),
        isActive: z.boolean().default(true),
        minTransfer: amountSchema,
        maxTransfer: amountSchema,
    })
    .superRefine((value, ctx) => {
        if (value.minTransfer >= value.maxTransfer) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "minTransfer must be less than maxTransfer",
                path: ["minTransfer"],
            });
        }
    });

export const UpdateBankSchema = z
    .object({
        name: z.string().trim().min(2, "Bank name is required").optional(),
        code: z
            .string()
            .trim()
            .min(2, "Bank code is required")
            .max(20, "Bank code is too long")
            .regex(/^[A-Za-z0-9_-]+$/, "Bank code can only contain letters, numbers, _ and -")
            .optional(),
        accountNumberRegex: z
            .string()
            .trim()
            .min(1, "accountNumberRegex is required")
            .refine((value) => canCompileRegex(value), "accountNumberRegex is invalid")
            .optional(),
        isActive: z.boolean().optional(),
        minTransfer: amountSchema.optional(),
        maxTransfer: amountSchema.optional(),
    })
    .superRefine((value, ctx) => {
        if (
            typeof value.minTransfer === "number" &&
            typeof value.maxTransfer === "number" &&
            value.minTransfer >= value.maxTransfer
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "minTransfer must be less than maxTransfer",
                path: ["minTransfer"],
            });
        }
    });

export type BankType = z.infer<typeof BankSchema>;
export type UpdateBankType = z.infer<typeof UpdateBankSchema>;

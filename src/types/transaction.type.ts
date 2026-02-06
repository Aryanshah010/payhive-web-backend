import z from "zod";

export const TransactionBaseSchema = z.object({
    toPhoneNumber: z
        .string()
        .regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)"),
    amount: z
        .number()
        .positive("Amount must be greater than 0")
        .refine((val) => Number.isInteger(val * 100), "Amount must have at most 2 decimal places"),
    remark: z.string().max(140, "Remark must be at most 140 characters").optional(),
});

export const TransactionConfirmSchema = TransactionBaseSchema.extend({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
    idempotencyKey: z.string().min(8, "Idempotency key too short").optional(),
});

export type TransactionBaseType = z.infer<typeof TransactionBaseSchema>;
export type TransactionConfirmType = z.infer<typeof TransactionConfirmSchema>;

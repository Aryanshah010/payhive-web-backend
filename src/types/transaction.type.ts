import z from "zod";

export const TransactionBaseSchema = z.object({
    toPhoneNumber: z
        .string()
        .regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)"),
    amount: z.number().positive("Amount must be greater than 0"),
    remark: z.string().max(140, "Remark must be at most 140 characters").optional(),
});

export const TransactionConfirmSchema = TransactionBaseSchema.extend({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
});

export type TransactionBaseType = z.infer<typeof TransactionBaseSchema>;
export type TransactionConfirmType = z.infer<typeof TransactionConfirmSchema>;

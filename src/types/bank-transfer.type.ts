import z from "zod";

export const BankTransferSchema = z.object({
    bankId: z.string().trim().min(1, "bankId is required"),
    accountNumber: z.string().trim().min(4, "accountNumber is required"),
    amount: z
        .number()
        .positive("amount must be greater than 0")
        .refine((value) => Number.isInteger(value * 100), "Amount must have at most 2 decimal places"),
});

export type BankTransferType = z.infer<typeof BankTransferSchema>;

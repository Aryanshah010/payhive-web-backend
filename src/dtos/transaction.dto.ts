import z from "zod";
import { TransactionBaseSchema, TransactionConfirmSchema } from "../types/transaction.type";

export const PreviewTransferDto = TransactionBaseSchema;
export type PreviewTransferDto = z.infer<typeof PreviewTransferDto>;

export const ConfirmTransferDto = TransactionConfirmSchema;
export type ConfirmTransferDto = z.infer<typeof ConfirmTransferDto>;

export const BeneficiaryLookupDto = z.object({
    phoneNumber: z.string().regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)"),
});
export type BeneficiaryLookupDto = z.infer<typeof BeneficiaryLookupDto>;

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

export const TransactionHistoryDirectionSchema = z.enum(["all", "debit", "credit"]);
export type TransactionHistoryDirectionDto = z.infer<typeof TransactionHistoryDirectionSchema>;

export const TransactionHistoryQueryDto = z.object({
    page: z.preprocess((value) => parsePositiveInt(value, 1), z.number().int().min(1)).default(1),
    limit: z.preprocess((value) => parsePositiveInt(value, 10), z.number().int().min(1).max(50)).default(10),
    search: z
        .preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string())
        .default(""),
    direction: z
        .preprocess(
            (value) => (typeof value === "string" ? value.trim().toLowerCase() : "all"),
            TransactionHistoryDirectionSchema
        )
        .default("all"),
});
export type TransactionHistoryQueryDto = z.infer<typeof TransactionHistoryQueryDto>;

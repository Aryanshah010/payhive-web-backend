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

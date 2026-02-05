import z from "zod";
import { TransactionBaseSchema, TransactionConfirmSchema } from "../types/transaction.type";

export const PreviewTransferDto = TransactionBaseSchema;
export type PreviewTransferDto = z.infer<typeof PreviewTransferDto>;

export const ConfirmTransferDto = TransactionConfirmSchema;
export type ConfirmTransferDto = z.infer<typeof ConfirmTransferDto>;

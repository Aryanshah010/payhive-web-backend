import z from "zod";
import { BankTransferSchema } from "../types/bank-transfer.type";

export const CreateBankTransferDto = BankTransferSchema;
export type CreateBankTransferDto = z.infer<typeof CreateBankTransferDto>;

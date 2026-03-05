import z from "zod";
import { BankSchema, UpdateBankSchema } from "../types/bank.type";

export const CreateBankDto = BankSchema;
export type CreateBankDto = z.infer<typeof CreateBankDto>;

export const UpdateBankDto = UpdateBankSchema;
export type UpdateBankDto = z.infer<typeof UpdateBankDto>;

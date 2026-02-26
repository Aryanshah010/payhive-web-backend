import z from "zod";
import {
    FeeConfigListQuerySchema,
    FeeConfigSchema,
} from "../types/fee-config.type";

export const CreateFeeConfigDto = FeeConfigSchema;
export type CreateFeeConfigDto = z.infer<typeof CreateFeeConfigDto>;

export const UpdateFeeConfigDto = FeeConfigSchema.partial();
export type UpdateFeeConfigDto = z.infer<typeof UpdateFeeConfigDto>;

export const FeeConfigListQueryDto = FeeConfigListQuerySchema;
export type FeeConfigListQueryDto = z.infer<typeof FeeConfigListQueryDto>;

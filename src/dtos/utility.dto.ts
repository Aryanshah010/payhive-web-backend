import z from "zod";
import {
    InternetPaymentSchema,
    TopupPaymentSchema,
    UtilityListQuerySchema,
    UtilitySchema,
} from "../types/utility.type";

export const CreateUtilityServiceDto = UtilitySchema;
export type CreateUtilityServiceDto = z.infer<typeof CreateUtilityServiceDto>;

export const UpdateUtilityServiceDto = UtilitySchema.partial();
export type UpdateUtilityServiceDto = z.infer<typeof UpdateUtilityServiceDto>;

export const UtilityListQueryDto = UtilityListQuerySchema;
export type UtilityListQueryDto = z.infer<typeof UtilityListQueryDto>;

export const InternetPaymentDto = InternetPaymentSchema;
export type InternetPaymentDto = z.infer<typeof InternetPaymentDto>;

export const TopupPaymentDto = TopupPaymentSchema;
export type TopupPaymentDto = z.infer<typeof TopupPaymentDto>;

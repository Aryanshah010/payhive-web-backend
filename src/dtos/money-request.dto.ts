import z from "zod";
import {
    MoneyRequestAcceptSchema,
    MoneyRequestCreateSchema,
    MoneyRequestIdParamSchema,
    MoneyRequestListQuerySchema,
} from "../types/money-request.type";

export const MoneyRequestCreateDto = MoneyRequestCreateSchema;
export type MoneyRequestCreateDto = z.infer<typeof MoneyRequestCreateDto>;

export const MoneyRequestAcceptDto = MoneyRequestAcceptSchema;
export type MoneyRequestAcceptDto = z.infer<typeof MoneyRequestAcceptDto>;

export const MoneyRequestListQueryDto = MoneyRequestListQuerySchema;
export type MoneyRequestListQueryDto = z.infer<typeof MoneyRequestListQueryDto>;

export const MoneyRequestIdParamDto = MoneyRequestIdParamSchema;
export type MoneyRequestIdParamDto = z.infer<typeof MoneyRequestIdParamDto>;

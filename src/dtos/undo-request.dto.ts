import z from "zod";
import {
    CreateUndoRequestSchema,
    UndoRequestAcceptSchema,
    UndoRequestIdParamSchema,
} from "../types/undo-request.type";

export const CreateUndoRequestDto = CreateUndoRequestSchema;
export type CreateUndoRequestDto = z.infer<typeof CreateUndoRequestDto>;

export const UndoRequestIdParamDto = UndoRequestIdParamSchema;
export type UndoRequestIdParamDto = z.infer<typeof UndoRequestIdParamDto>;

export const UndoRequestAcceptDto = UndoRequestAcceptSchema;
export type UndoRequestAcceptDto = z.infer<typeof UndoRequestAcceptDto>;

import z from "zod";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const UNDO_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "DENIED"] as const;
export type UndoRequestStatus = (typeof UNDO_REQUEST_STATUSES)[number];

export const UndoRequestStatusSchema = z.enum(UNDO_REQUEST_STATUSES);

export const CreateUndoRequestSchema = z.object({
    txId: z.string().trim().min(1, "txId is required").max(120, "txId is too long"),
});

export const UndoRequestIdParamSchema = z.object({
    requestId: z.string().regex(OBJECT_ID_REGEX, "requestId must be a valid ObjectId"),
});

export const UndoRequestAcceptSchema = z.object({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
});

export type CreateUndoRequestType = z.infer<typeof CreateUndoRequestSchema>;
export type UndoRequestIdParamType = z.infer<typeof UndoRequestIdParamSchema>;
export type UndoRequestAcceptType = z.infer<typeof UndoRequestAcceptSchema>;

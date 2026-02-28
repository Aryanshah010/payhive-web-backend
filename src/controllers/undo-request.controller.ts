import { Request, Response } from "express";
import z from "zod";
import {
    CreateUndoRequestDto,
    UndoRequestAcceptDto,
    UndoRequestIdParamDto,
} from "../dtos/undo-request.dto";
import { UndoRequestService } from "../services/undo-request.service";

let undoRequestService = new UndoRequestService();

export class UndoRequestController {
    async create(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedBody = CreateUndoRequestDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await undoRequestService.createUndoRequest(userId.toString(), parsedBody.data.txId);
            return res.status(201).json({
                success: true,
                message: "Undo request created",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }

    async accept(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedParams = UndoRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const parsedBody = UndoRequestAcceptDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await undoRequestService.acceptUndoRequest(
                userId.toString(),
                parsedParams.data.requestId,
                parsedBody.data.pin
            );

            return res.status(200).json({
                success: true,
                message: "Undo request accepted",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }

    async reject(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedParams = UndoRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const data = await undoRequestService.rejectUndoRequest(
                userId.toString(),
                parsedParams.data.requestId
            );

            return res.status(200).json({
                success: true,
                message: "Undo request rejected",
                data,
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }
}

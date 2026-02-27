import { Request, Response } from "express";
import z from "zod";
import {
    MoneyRequestAcceptDto,
    MoneyRequestCreateDto,
    MoneyRequestIdParamDto,
    MoneyRequestListQueryDto,
} from "../dtos/money-request.dto";
import { MoneyRequestService } from "../services/money-request.service";

let moneyRequestService = new MoneyRequestService();

export class MoneyRequestController {
    async create(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedBody = MoneyRequestCreateDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await moneyRequestService.createRequest(
                userId.toString(),
                parsedBody.data.toPhoneNumber,
                parsedBody.data.amount,
                parsedBody.data.remark
            );

            return res.status(201).json({
                success: true,
                message: "Money request created",
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

    async listIncoming(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedQuery = MoneyRequestListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const data = await moneyRequestService.listIncoming(
                userId.toString(),
                parsedQuery.data.page,
                parsedQuery.data.limit,
                parsedQuery.data.status
            );

            return res.status(200).json({
                success: true,
                message: "Incoming money requests fetched",
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

    async listOutgoing(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedQuery = MoneyRequestListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const data = await moneyRequestService.listOutgoing(
                userId.toString(),
                parsedQuery.data.page,
                parsedQuery.data.limit,
                parsedQuery.data.status
            );

            return res.status(200).json({
                success: true,
                message: "Outgoing money requests fetched",
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

    async getById(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedParams = MoneyRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const data = await moneyRequestService.getById(userId.toString(), parsedParams.data.requestId);
            return res.status(200).json({ success: true, message: "Money request fetched", data });
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

            const parsedParams = MoneyRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const parsedBody = MoneyRequestAcceptDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await moneyRequestService.acceptRequest(
                userId.toString(),
                parsedParams.data.requestId,
                parsedBody.data.pin
            );

            return res.status(200).json({
                success: true,
                message: "Money request accepted",
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

            const parsedParams = MoneyRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const data = await moneyRequestService.rejectRequest(
                userId.toString(),
                parsedParams.data.requestId
            );

            return res.status(200).json({
                success: true,
                message: "Money request rejected",
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

    async cancel(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedParams = MoneyRequestIdParamDto.safeParse(req.params);
            if (!parsedParams.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedParams.error),
                });
            }

            const data = await moneyRequestService.cancelRequest(
                userId.toString(),
                parsedParams.data.requestId
            );

            return res.status(200).json({
                success: true,
                message: "Money request canceled",
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

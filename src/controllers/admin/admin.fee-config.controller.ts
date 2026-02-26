import { Request, Response } from "express";
import z from "zod";
import {
    CreateFeeConfigDto,
    FeeConfigListQueryDto,
    UpdateFeeConfigDto,
} from "../../dtos/fee-config.dto";
import { AdminFeeConfigService } from "../../services/admin/admin.fee-config.service";

let adminFeeConfigService = new AdminFeeConfigService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class AdminFeeConfigController {
    async createConfig(req: Request, res: Response) {
        try {
            const parsedBody = CreateFeeConfigDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminFeeConfigService.createConfig(parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Fee config created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listConfigs(req: Request, res: Response) {
        try {
            const parsedQuery = FeeConfigListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, type, appliesTo, isActive } = parsedQuery.data;
            const data = await adminFeeConfigService.listConfigs({
                page,
                limit,
                type,
                appliesTo,
                isActive,
            });

            return res.status(200).json({
                success: true,
                message: "Fee configs fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getConfig(req: Request, res: Response) {
        try {
            const data = await adminFeeConfigService.getConfig(req.params.id);
            return res.status(200).json({
                success: true,
                message: "Fee config fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async updateConfig(req: Request, res: Response) {
        try {
            const parsedBody = UpdateFeeConfigDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminFeeConfigService.updateConfig(req.params.id, parsedBody.data);
            return res.status(200).json({
                success: true,
                message: "Fee config updated successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async deleteConfig(req: Request, res: Response) {
        try {
            await adminFeeConfigService.deleteConfig(req.params.id);
            return res.status(204).send();
        } catch (error) {
            return sendError(res, error);
        }
    }
}

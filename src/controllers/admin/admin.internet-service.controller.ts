import { Request, Response } from "express";
import z from "zod";
import {
    CreateUtilityServiceDto,
    UpdateUtilityServiceDto,
    UtilityListQueryDto,
} from "../../dtos/utility.dto";
import { AdminUtilityServiceService } from "../../services/admin/admin.utility-service.service";

let adminUtilityService = new AdminUtilityServiceService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class AdminInternetServiceController {
    async createService(req: Request, res: Response) {
        try {
            const parsedBody = CreateUtilityServiceDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminUtilityService.createService("internet", parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Internet service created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getService(req: Request, res: Response) {
        try {
            const data = await adminUtilityService.getService("internet", req.params.id);
            return res.status(200).json({
                success: true,
                message: "Internet service fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listServices(req: Request, res: Response) {
        try {
            const parsedQuery = UtilityListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, provider, search, isActive } = parsedQuery.data;
            const data = await adminUtilityService.listServices({
                type: "internet",
                page,
                limit,
                provider,
                search,
                isActive,
            });

            return res.status(200).json({
                success: true,
                message: "Internet services fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async updateService(req: Request, res: Response) {
        try {
            const parsedBody = UpdateUtilityServiceDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminUtilityService.updateService("internet", req.params.id, parsedBody.data);
            return res.status(200).json({
                success: true,
                message: "Internet service updated successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async deleteService(req: Request, res: Response) {
        try {
            await adminUtilityService.deleteService("internet", req.params.id);
            return res.status(204).send();
        } catch (error) {
            return sendError(res, error);
        }
    }
}

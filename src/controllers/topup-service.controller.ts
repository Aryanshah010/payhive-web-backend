import { Request, Response } from "express";
import z from "zod";
import { UtilityListQueryDto } from "../dtos/utility.dto";
import { UtilityService } from "../services/utility.service";

let utilityService = new UtilityService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class TopupServiceController {
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

            const { page, limit, provider, search } = parsedQuery.data;
            const data = await utilityService.listPublicServices({
                type: "topup",
                page,
                limit,
                provider,
                search,
            });

            return res.status(200).json({
                success: true,
                message: "Topup services fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getService(req: Request, res: Response) {
        try {
            const data = await utilityService.getPublicServiceById("topup", req.params.id);
            return res.status(200).json({
                success: true,
                message: "Topup service fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

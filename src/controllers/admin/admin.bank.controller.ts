import { Request, Response } from "express";
import z from "zod";
import { CreateBankDto, UpdateBankDto } from "../../dtos/bank.dto";
import { AdminBankService } from "../../services/admin/admin.bank.service";

let adminBankService = new AdminBankService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        status: "error",
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
    });
};

export class AdminBankController {
    async createBank(req: Request, res: Response) {
        try {
            const parsedBody = CreateBankDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    status: "error",
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminBankService.createBank(parsedBody.data);
            return res.status(201).json({
                status: "success",
                message: "Bank created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listBanks(req: Request, res: Response) {
        try {
            const data = await adminBankService.listBanks();
            return res.status(200).json({
                status: "success",
                message: "Banks fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async updateBank(req: Request, res: Response) {
        try {
            const parsedBody = UpdateBankDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    status: "error",
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminBankService.updateBank(req.params.id, parsedBody.data);
            return res.status(200).json({
                status: "success",
                message: "Bank updated successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async deleteBank(req: Request, res: Response) {
        try {
            await adminBankService.deleteBank(req.params.id);
            return res.status(204).send();
        } catch (error) {
            return sendError(res, error);
        }
    }
}

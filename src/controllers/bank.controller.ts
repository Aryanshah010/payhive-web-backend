import { Request, Response } from "express";
import { BankService } from "../services/bank.service";

let bankService = new BankService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        status: "error",
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
    });
};

export class BankController {
    async listActiveBanks(req: Request, res: Response) {
        try {
            const data = await bankService.listActiveBanks();
            return res.status(200).json({
                status: "success",
                message: "Banks fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

import { Request, Response } from "express";
import z from "zod";
import { CreateBankTransferDto } from "../dtos/bank-transfer.dto";
import { BankTransferService } from "../services/bank-transfer.service";

let bankTransferService = new BankTransferService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        status: "error",
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
    });
};

export class BankTransferController {
    async createTransfer(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(403).json({
                    status: "error",
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedBody = CreateBankTransferDto.safeParse(req.body);
            if (!parsedBody.success) {
                const invalidAmountIssue = parsedBody.error.issues.find((issue) =>
                    issue.path.includes("amount")
                );
                const invalidAccountIssue = parsedBody.error.issues.find((issue) =>
                    issue.path.includes("accountNumber")
                );
                const invalidBankIssue = parsedBody.error.issues.find((issue) =>
                    issue.path.includes("bankId")
                );

                let code = "VALIDATION_ERROR";
                if (invalidAmountIssue) {
                    code = "INVALID_AMOUNT";
                } else if (invalidAccountIssue) {
                    code = "INVALID_ACCOUNT_NUMBER";
                } else if (invalidBankIssue) {
                    code = "INVALID_BANK";
                }

                return res.status(400).json({
                    status: "error",
                    code,
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await bankTransferService.transferToBank(
                userId.toString(),
                parsedBody.data.bankId,
                parsedBody.data.accountNumber,
                parsedBody.data.amount
            );

            return res.status(200).json({
                status: "success",
                message: "Bank transfer successful",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

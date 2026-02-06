import { Request, Response } from "express";
import z from "zod";
import { PreviewTransferDto, ConfirmTransferDto, BeneficiaryLookupDto } from "../dtos/transaction.dto";
import { TransactionService } from "../services/transaction.service";

let transactionService = new TransactionService();

export class TransactionController {
    async lookupBeneficiary(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedData = BeneficiaryLookupDto.safeParse({ phoneNumber: req.query.phoneNumber });
            if (!parsedData.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedData.error),
                });
            }

            const data = await transactionService.lookupBeneficiary(
                userId.toString(),
                parsedData.data.phoneNumber
            );

            return res.status(200).json({ success: true, message: "Beneficiary found", data });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }

    async preview(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedData = PreviewTransferDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedData.error),
                });
            }

            const data = await transactionService.previewTransfer(
                userId.toString(),
                parsedData.data.toPhoneNumber,
                parsedData.data.amount,
                parsedData.data.remark
            );

            return res.status(200).json({ success: true, message: "Preview OK", data });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }

    async confirm(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const parsedData = ConfirmTransferDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedData.error),
                });
            }

            const data = await transactionService.confirmTransfer(
                userId.toString(),
                parsedData.data.toPhoneNumber,
                parsedData.data.amount,
                parsedData.data.remark,
                parsedData.data.pin,
                (req.header("Idempotency-Key") || parsedData.data.idempotencyKey || undefined) as string | undefined
            );

            return res.status(200).json({
                success: true,
                message: "Transfer successful",
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

    async history(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
            const limit = Math.max(1, parseInt((req.query.limit as string) || "10", 10));

            const data = await transactionService.getHistory(userId.toString(), page, limit);
            return res.status(200).json({ success: true, message: "Transactions fetched", data });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }

    async getByTxId(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const txId = req.params.txId;
            const data = await transactionService.getByTxId(userId.toString(), txId);
            return res.status(200).json({ success: true, message: "Transaction fetched", data });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
                ...(error.details ? { data: error.details } : {}),
            });
        }
    }
}

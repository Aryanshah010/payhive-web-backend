import { Request, Response } from "express";
import z from "zod";
import { PreviewTransferDto, ConfirmTransferDto } from "../dtos/transaction.dto";
import { TransactionService } from "../services/transaction.service";

let transactionService = new TransactionService();

export class TransactionController {
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
                parsedData.data.pin
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
            });
        }
    }
}

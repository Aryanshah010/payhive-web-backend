import { Request, Response } from "express";
import z from "zod";
import { InternetPaymentDto, TopupPaymentDto } from "../dtos/utility.dto";
import { UtilityPaymentService } from "../services/utility-payment.service";

let utilityPaymentService = new UtilityPaymentService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class UtilityPaymentController {
    async payInternet(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedBody = InternetPaymentDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const idempotencyKey = (req.header("Idempotency-Key") || "").trim() || undefined;
            const data = await utilityPaymentService.payInternetService(
                userId.toString(),
                req.params.id,
                parsedBody.data.customerId,
                idempotencyKey
            );

            return res.status(200).json({
                success: true,
                message: "Internet payment successful",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async payTopup(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedBody = TopupPaymentDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const idempotencyKey = (req.header("Idempotency-Key") || "").trim() || undefined;
            const data = await utilityPaymentService.payTopupService(
                userId.toString(),
                req.params.id,
                parsedBody.data.phoneNumber,
                idempotencyKey
            );

            return res.status(200).json({
                success: true,
                message: "Topup payment successful",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

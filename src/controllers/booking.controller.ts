import { Request, Response } from "express";
import z from "zod";
import { BookingListQueryDto, CreateBookingDto, PayBookingDto } from "../dtos/booking.dto";
import { BookingService } from "../services/booking.service";

let bookingService = new BookingService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class BookingController {
    async createBooking(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedBody = CreateBookingDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await bookingService.createBooking(userId.toString(), parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Booking created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listBookings(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedQuery = BookingListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const data = await bookingService.listUserBookings(userId.toString(), parsedQuery.data);
            return res.status(200).json({
                success: true,
                message: "Bookings fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getBooking(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const data = await bookingService.getUserBooking(userId.toString(), req.params.id);
            return res.status(200).json({
                success: true,
                message: "Booking fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async payBooking(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    code: "UNAUTHORIZED",
                    message: "Unauthorized",
                });
            }

            const parsedBody = PayBookingDto.safeParse(req.body ?? {});
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const idempotencyKey = (req.header("Idempotency-Key") || "").trim() || undefined;
            const data = await bookingService.payBooking(userId.toString(), req.params.id, idempotencyKey);

            return res.status(200).json({
                success: true,
                message: "Booking payment successful",
                data: {
                    booking: {
                        id: data.booking._id.toString(),
                        status: data.booking.status,
                        paymentTxnId: data.booking.paymentTxnId,
                        paidAt: data.booking.paidAt,
                    },
                    transactionId: data.transactionId,
                    idempotentReplay: data.idempotentReplay,
                    amount: data.amount,
                    fee: data.fee,
                    totalDebited: data.totalDebited,
                },
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

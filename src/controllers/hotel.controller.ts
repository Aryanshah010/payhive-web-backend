import { Request, Response } from "express";
import z from "zod";
import { HotelListQueryDto } from "../dtos/hotel.dto";
import { HotelService } from "../services/hotel.service";

let hotelService = new HotelService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class HotelController {
    async listHotels(req: Request, res: Response) {
        try {
            const parsedQuery = HotelListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, city } = parsedQuery.data;
            const data = await hotelService.listPublicHotels({ page, limit, city });
            return res.status(200).json({
                success: true,
                message: "Hotels fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getHotel(req: Request, res: Response) {
        try {
            const data = await hotelService.getHotelById(req.params.id);
            return res.status(200).json({
                success: true,
                message: "Hotel fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

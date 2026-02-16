import { Request, Response } from "express";
import z from "zod";
import {
    CreateHotelDto,
    HotelAdminListQueryDto,
    UpdateHotelDto,
} from "../../dtos/hotel.dto";
import { AdminHotelService } from "../../services/admin/admin.hotel.service";

let adminHotelService = new AdminHotelService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class AdminHotelController {
    async createHotel(req: Request, res: Response) {
        try {
            const parsedBody = CreateHotelDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminHotelService.createHotel(parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Hotel created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getHotel(req: Request, res: Response) {
        try {
            const data = await adminHotelService.getHotel(req.params.id);
            return res.status(200).json({
                success: true,
                message: "Hotel fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listHotels(req: Request, res: Response) {
        try {
            const parsedQuery = HotelAdminListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, city, search } = parsedQuery.data;
            const data = await adminHotelService.listHotels({
                page,
                limit,
                city,
                search,
            });
            return res.status(200).json({
                success: true,
                message: "Hotels fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async updateHotel(req: Request, res: Response) {
        try {
            const parsedBody = UpdateHotelDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminHotelService.updateHotel(req.params.id, parsedBody.data);
            return res.status(200).json({
                success: true,
                message: "Hotel updated successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async deleteHotel(req: Request, res: Response) {
        try {
            await adminHotelService.deleteHotel(req.params.id);
            return res.status(204).send();
        } catch (error) {
            return sendError(res, error);
        }
    }
}

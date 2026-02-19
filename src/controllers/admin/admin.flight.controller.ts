import { Request, Response } from "express";
import z from "zod";
import {
    CreateFlightDto,
    FlightAdminListQueryDto,
    UpdateFlightDto,
} from "../../dtos/flight.dto";
import { AdminFlightService } from "../../services/admin/admin.flight.service";

let adminFlightService = new AdminFlightService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class AdminFlightController {
    async createFlight(req: Request, res: Response) {
        try {
            const parsedBody = CreateFlightDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminFlightService.createFlight(parsedBody.data);
            return res.status(201).json({
                success: true,
                message: "Flight created successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getFlight(req: Request, res: Response) {
        try {
            const data = await adminFlightService.getFlight(req.params.id);
            return res.status(200).json({
                success: true,
                message: "Flight fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async listFlights(req: Request, res: Response) {
        try {
            const parsedQuery = FlightAdminListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, from, to, date, search, class: flightClass } = parsedQuery.data;
            const data = await adminFlightService.listFlights({
                page,
                limit,
                from,
                to,
                date,
                search,
                class: flightClass,
            });
            return res.status(200).json({
                success: true,
                message: "Flights fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async updateFlight(req: Request, res: Response) {
        try {
            const parsedBody = UpdateFlightDto.safeParse(req.body);
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminFlightService.updateFlight(req.params.id, parsedBody.data);
            return res.status(200).json({
                success: true,
                message: "Flight updated successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async deleteFlight(req: Request, res: Response) {
        try {
            await adminFlightService.deleteFlight(req.params.id);
            return res.status(204).send();
        } catch (error) {
            return sendError(res, error);
        }
    }
}

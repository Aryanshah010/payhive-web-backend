import { Request, Response } from "express";
import z from "zod";
import { FlightListQueryDto } from "../dtos/flight.dto";
import { FlightService } from "../services/flight.service";

let flightService = new FlightService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class FlightController {
    async listFlights(req: Request, res: Response) {
        try {
            const parsedQuery = FlightListQueryDto.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedQuery.error),
                });
            }

            const { page, limit, from, to, date } = parsedQuery.data;
            const data = await flightService.listPublicFlights({ page, limit, from, to, date });
            return res.status(200).json({
                success: true,
                message: "Flights fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }

    async getFlight(req: Request, res: Response) {
        try {
            const data = await flightService.getFlightById(req.params.id);
            return res.status(200).json({
                success: true,
                message: "Flight fetched successfully",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

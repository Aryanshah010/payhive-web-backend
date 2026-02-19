import z from "zod";
import {
    FlightSchema,
    FlightListQuerySchema,
    FlightAdminListQuerySchema,
} from "../types/flight.type";

export const CreateFlightDto = FlightSchema;
export type CreateFlightDto = z.infer<typeof CreateFlightDto>;

export const UpdateFlightDto = FlightSchema.partial();
export type UpdateFlightDto = z.infer<typeof UpdateFlightDto>;

export const FlightListQueryDto = FlightListQuerySchema;
export type FlightListQueryDto = z.infer<typeof FlightListQueryDto>;

export const FlightAdminListQueryDto = FlightAdminListQuerySchema;
export type FlightAdminListQueryDto = z.infer<typeof FlightAdminListQueryDto>;

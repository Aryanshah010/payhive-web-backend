import z from "zod";
import {
    HotelSchema,
    HotelListQuerySchema,
    HotelAdminListQuerySchema,
} from "../types/hotel.type";

export const CreateHotelDto = HotelSchema;
export type CreateHotelDto = z.infer<typeof CreateHotelDto>;

export const UpdateHotelDto = HotelSchema.partial();
export type UpdateHotelDto = z.infer<typeof UpdateHotelDto>;

export const HotelListQueryDto = HotelListQuerySchema;
export type HotelListQueryDto = z.infer<typeof HotelListQueryDto>;

export const HotelAdminListQueryDto = HotelAdminListQuerySchema;
export type HotelAdminListQueryDto = z.infer<typeof HotelAdminListQueryDto>;

import z from "zod";
import {
    BookingCreateSchema,
    BookingPaySchema,
    BookingListQuerySchema,
} from "../types/booking.type";

export const CreateBookingDto = BookingCreateSchema;
export type CreateBookingDto = z.infer<typeof CreateBookingDto>;

export const PayBookingDto = BookingPaySchema;
export type PayBookingDto = z.infer<typeof PayBookingDto>;

export const BookingListQueryDto = BookingListQuerySchema;
export type BookingListQueryDto = z.infer<typeof BookingListQueryDto>;

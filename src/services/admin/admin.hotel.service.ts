import { CreateHotelDto, UpdateHotelDto } from "../../dtos/hotel.dto";
import { HttpError } from "../../errors/http-error";
import { HotelRepository } from "../../repositories/hotel.repository";

let hotelRepository = new HotelRepository();

interface ListAdminHotelsParams {
    page: number;
    limit: number;
    city?: string;
    search?: string;
}

export class AdminHotelService {
    async createHotel(data: CreateHotelDto) {
        return hotelRepository.createHotel(data);
    }

    async getHotel(hotelId: string) {
        const hotel = await hotelRepository.getHotelById(hotelId);
        if (!hotel) {
            throw new HttpError(404, "Hotel not found", { code: "NOT_FOUND" });
        }
        return hotel;
    }

    async listHotels(params: ListAdminHotelsParams) {
        const { page, limit, city, search } = params;
        const { hotels, total } = await hotelRepository.listAdminHotels({
            page,
            limit,
            city,
            search,
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        return {
            items: hotels,
            total,
            page,
            limit,
            totalPages,
        };
    }

    async updateHotel(hotelId: string, data: UpdateHotelDto) {
        const existing = await hotelRepository.getHotelById(hotelId);
        if (!existing) {
            throw new HttpError(404, "Hotel not found", { code: "NOT_FOUND" });
        }

        const nextRoomsTotal = data.roomsTotal ?? existing.roomsTotal;
        const nextRoomsAvailable = data.roomsAvailable ?? existing.roomsAvailable;
        if (nextRoomsAvailable > nextRoomsTotal) {
            throw new HttpError(400, "Rooms available cannot exceed rooms total", {
                code: "VALIDATION_ERROR",
            });
        }

        const updated = await hotelRepository.updateHotel(hotelId, data);
        if (!updated) {
            throw new HttpError(500, "Failed to update hotel");
        }

        return updated;
    }

    async deleteHotel(hotelId: string) {
        const deleted = await hotelRepository.deleteHotel(hotelId);
        if (!deleted) {
            throw new HttpError(404, "Hotel not found", { code: "NOT_FOUND" });
        }
        return true;
    }
}

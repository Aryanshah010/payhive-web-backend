import { HotelRepository } from "../repositories/hotel.repository";
import { HttpError } from "../errors/http-error";

let hotelRepository = new HotelRepository();

interface ListPublicHotelsParams {
    page: number;
    limit: number;
    city?: string;
}

export class HotelService {
    async listPublicHotels(params: ListPublicHotelsParams) {
        const { page, limit, city } = params;

        const { hotels, total } = await hotelRepository.listPublicHotels({
            page,
            limit,
            city,
            onlyAvailable: true,
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

    async getHotelById(hotelId: string) {
        const hotel = await hotelRepository.getHotelById(hotelId);
        if (!hotel) {
            throw new HttpError(404, "Hotel not found", { code: "NOT_FOUND" });
        }
        return hotel;
    }
}

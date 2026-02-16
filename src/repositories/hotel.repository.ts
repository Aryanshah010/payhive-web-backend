import { ClientSession } from "mongoose";
import { HotelModel, IHotel } from "../models/hotel.model";

interface ListHotelsParams {
    page: number;
    limit: number;
    city?: string;
    search?: string;
    onlyAvailable?: boolean;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface IHotelRepository {
    createHotel(data: Partial<IHotel>): Promise<IHotel>;
    getHotelById(id: string): Promise<IHotel | null>;
    updateHotel(id: string, data: Partial<IHotel>): Promise<IHotel | null>;
    deleteHotel(id: string): Promise<boolean>;
    listPublicHotels(params: ListHotelsParams): Promise<{ hotels: IHotel[]; total: number }>;
    listAdminHotels(params: ListHotelsParams): Promise<{ hotels: IHotel[]; total: number }>;
    reserveRooms(itemId: string, quantity: number, session?: ClientSession): Promise<IHotel | null>;
    releaseRooms(itemId: string, quantity: number, session?: ClientSession): Promise<IHotel | null>;
}

export class HotelRepository implements IHotelRepository {
    async createHotel(data: Partial<IHotel>): Promise<IHotel> {
        const hotel = new HotelModel(data);
        return await hotel.save();
    }

    async getHotelById(id: string): Promise<IHotel | null> {
        return HotelModel.findById(id);
    }

    async updateHotel(id: string, data: Partial<IHotel>): Promise<IHotel | null> {
        return HotelModel.findByIdAndUpdate(id, data, { new: true });
    }

    async deleteHotel(id: string): Promise<boolean> {
        const result = await HotelModel.findByIdAndDelete(id);
        return Boolean(result);
    }

    async listPublicHotels(params: ListHotelsParams) {
        const query = this.buildListQuery(params, false);
        const skip = (params.page - 1) * params.limit;

        const [hotels, total] = await Promise.all([
            HotelModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(params.limit),
            HotelModel.countDocuments(query),
        ]);

        return { hotels, total };
    }

    async listAdminHotels(params: ListHotelsParams) {
        const query = this.buildListQuery(params, true);
        const skip = (params.page - 1) * params.limit;

        const [hotels, total] = await Promise.all([
            HotelModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(params.limit),
            HotelModel.countDocuments(query),
        ]);

        return { hotels, total };
    }

    async reserveRooms(itemId: string, quantity: number, session?: ClientSession): Promise<IHotel | null> {
        return HotelModel.findOneAndUpdate(
            { _id: itemId, roomsAvailable: { $gte: quantity } },
            { $inc: { roomsAvailable: -quantity } },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    async releaseRooms(itemId: string, quantity: number, session?: ClientSession): Promise<IHotel | null> {
        return HotelModel.findByIdAndUpdate(
            itemId,
            { $inc: { roomsAvailable: quantity } },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    private buildListQuery(params: ListHotelsParams, includeSearch: boolean) {
        const query: Record<string, any> = {};

        if (params.city) {
            query.city = { $regex: escapeRegex(params.city), $options: "i" };
        }

        if (params.onlyAvailable) {
            query.roomsAvailable = { $gt: 0 };
        }

        if (includeSearch && params.search) {
            query.$or = [
                { name: { $regex: escapeRegex(params.search), $options: "i" } },
                { city: { $regex: escapeRegex(params.search), $options: "i" } },
                { roomType: { $regex: escapeRegex(params.search), $options: "i" } },
            ];
        }

        return query;
    }
}

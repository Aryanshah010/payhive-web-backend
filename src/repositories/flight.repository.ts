import { ClientSession } from "mongoose";
import { FlightModel, IFlight } from "../models/flight.model";

interface ListFlightsParams {
    page: number;
    limit: number;
    from?: string;
    to?: string;
    date?: string;
    search?: string;
    flightClass?: "Economy" | "Business";
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildDateRange = (dateOnly: string) => {
    const [year, month, day] = dateOnly.split("-").map((part) => Number.parseInt(part, 10));
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    return { start, end };
};

export interface IFlightRepository {
    createFlight(data: Partial<IFlight>): Promise<IFlight>;
    getFlightById(id: string): Promise<IFlight | null>;
    updateFlight(id: string, data: Partial<IFlight>): Promise<IFlight | null>;
    deleteFlight(id: string): Promise<boolean>;
    listPublicFlights(params: ListFlightsParams): Promise<{ flights: IFlight[]; total: number }>;
    listAdminFlights(params: ListFlightsParams): Promise<{ flights: IFlight[]; total: number }>;
    reserveSeats(itemId: string, quantity: number, session?: ClientSession): Promise<IFlight | null>;
    releaseSeats(itemId: string, quantity: number, session?: ClientSession): Promise<IFlight | null>;
}

export class FlightRepository implements IFlightRepository {
    async createFlight(data: Partial<IFlight>): Promise<IFlight> {
        const flight = new FlightModel(data);
        return await flight.save();
    }

    async getFlightById(id: string): Promise<IFlight | null> {
        return FlightModel.findById(id);
    }

    async updateFlight(id: string, data: Partial<IFlight>): Promise<IFlight | null> {
        return FlightModel.findByIdAndUpdate(id, data, { new: true });
    }

    async deleteFlight(id: string): Promise<boolean> {
        const result = await FlightModel.findByIdAndDelete(id);
        return Boolean(result);
    }

    async listPublicFlights(params: ListFlightsParams) {
        const query = this.buildListQuery(params, false);
        const skip = (params.page - 1) * params.limit;

        const [flights, total] = await Promise.all([
            FlightModel.find(query)
                .sort({ departure: 1 })
                .skip(skip)
                .limit(params.limit),
            FlightModel.countDocuments(query),
        ]);

        return { flights, total };
    }

    async listAdminFlights(params: ListFlightsParams) {
        const query = this.buildListQuery(params, true);
        const skip = (params.page - 1) * params.limit;

        const [flights, total] = await Promise.all([
            FlightModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(params.limit),
            FlightModel.countDocuments(query),
        ]);

        return { flights, total };
    }

    async reserveSeats(itemId: string, quantity: number, session?: ClientSession): Promise<IFlight | null> {
        return FlightModel.findOneAndUpdate(
            { _id: itemId, seatsAvailable: { $gte: quantity } },
            { $inc: { seatsAvailable: -quantity } },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    async releaseSeats(itemId: string, quantity: number, session?: ClientSession): Promise<IFlight | null> {
        return FlightModel.findByIdAndUpdate(
            itemId,
            { $inc: { seatsAvailable: quantity } },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    private buildListQuery(params: ListFlightsParams, includeSearch: boolean) {
        const query: Record<string, any> = {};

        if (params.from) {
            query.from = { $regex: escapeRegex(params.from), $options: "i" };
        }
        if (params.to) {
            query.to = { $regex: escapeRegex(params.to), $options: "i" };
        }
        if (params.date) {
            const { start, end } = buildDateRange(params.date);
            query.departure = { $gte: start, $lte: end };
        }
        if (params.flightClass) {
            query.class = params.flightClass;
        }
        if (includeSearch && params.search) {
            query.$or = [
                { airline: { $regex: escapeRegex(params.search), $options: "i" } },
                { flightNumber: { $regex: escapeRegex(params.search), $options: "i" } },
                { from: { $regex: escapeRegex(params.search), $options: "i" } },
                { to: { $regex: escapeRegex(params.search), $options: "i" } },
            ];
        }

        return query;
    }
}

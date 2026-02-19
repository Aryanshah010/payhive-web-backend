import { FlightRepository } from "../repositories/flight.repository";
import { HttpError } from "../errors/http-error";

let flightRepository = new FlightRepository();

interface ListPublicFlightsParams {
    page: number;
    limit: number;
    from?: string;
    to?: string;
    date?: string;
}

export class FlightService {
    async listPublicFlights(params: ListPublicFlightsParams) {
        const { page, limit, from, to, date } = params;
        const { flights, total } = await flightRepository.listPublicFlights({
            page,
            limit,
            from,
            to,
            date,
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        return {
            items: flights,
            total,
            page,
            limit,
            totalPages,
        };
    }

    async getFlightById(flightId: string) {
        const flight = await flightRepository.getFlightById(flightId);
        if (!flight) {
            throw new HttpError(404, "Flight not found", { code: "NOT_FOUND" });
        }
        return flight;
    }
}

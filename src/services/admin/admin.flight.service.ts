import { FlightRepository } from "../../repositories/flight.repository";
import { CreateFlightDto, UpdateFlightDto } from "../../dtos/flight.dto";
import { HttpError } from "../../errors/http-error";

let flightRepository = new FlightRepository();

interface ListAdminFlightsParams {
    page: number;
    limit: number;
    from?: string;
    to?: string;
    date?: string;
    search?: string;
    class?: "Economy" | "Business";
}

export class AdminFlightService {
    async createFlight(data: CreateFlightDto) {
        return flightRepository.createFlight(data);
    }

    async getFlight(flightId: string) {
        const flight = await flightRepository.getFlightById(flightId);
        if (!flight) {
            throw new HttpError(404, "Flight not found", { code: "NOT_FOUND" });
        }
        return flight;
    }

    async listFlights(params: ListAdminFlightsParams) {
        const { page, limit, from, to, date, search, class: flightClass } = params;
        const { flights, total } = await flightRepository.listAdminFlights({
            page,
            limit,
            from,
            to,
            date,
            search,
            flightClass,
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

    async updateFlight(flightId: string, data: UpdateFlightDto) {
        const existing = await flightRepository.getFlightById(flightId);
        if (!existing) {
            throw new HttpError(404, "Flight not found", { code: "NOT_FOUND" });
        }

        const nextSeatsTotal = data.seatsTotal ?? existing.seatsTotal;
        const nextSeatsAvailable = data.seatsAvailable ?? existing.seatsAvailable;
        if (nextSeatsAvailable > nextSeatsTotal) {
            throw new HttpError(400, "Seats available cannot exceed seats total", {
                code: "VALIDATION_ERROR",
            });
        }

        if (data.arrival && data.departure && data.arrival <= data.departure) {
            throw new HttpError(400, "Arrival must be after departure", {
                code: "VALIDATION_ERROR",
            });
        }

        const updated = await flightRepository.updateFlight(flightId, data);
        if (!updated) {
            throw new HttpError(500, "Failed to update flight");
        }
        return updated;
    }

    async deleteFlight(flightId: string) {
        const deleted = await flightRepository.deleteFlight(flightId);
        if (!deleted) {
            throw new HttpError(404, "Flight not found", { code: "NOT_FOUND" });
        }
        return true;
    }
}

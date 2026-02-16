import fs from "fs/promises";
import path from "path";
import { CreateFlightDto } from "../../dtos/flight.dto";
import { CreateHotelDto } from "../../dtos/hotel.dto";
import { CreateUtilityServiceDto } from "../../dtos/utility.dto";
import { FlightModel } from "../../models/flight.model";
import { HotelModel } from "../../models/hotel.model";
import { UtilityModel } from "../../models/utility.model";
import { HttpError } from "../../errors/http-error";
import { UtilityTypeSchema } from "../../types/utility.type";

const FLIGHTS_SEED_PATH = path.resolve(process.cwd(), "data/seeds/flights.json");
const HOTELS_SEED_PATH = path.resolve(process.cwd(), "data/seeds/hotels.json");
const UTILITIES_SEED_PATH = path.resolve(process.cwd(), "data/seeds/utilities.json");

interface ImportOptions {
    overwrite?: boolean;
}

interface ImportResult {
    flights: {
        loaded: number;
    };
    hotels: {
        loaded: number;
    };
    utilities: {
        loaded: number;
    };
}

const readJsonArray = async (filePath: string): Promise<Record<string, unknown>[]> => {
    const contents = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
        throw new HttpError(400, `Seed file is not a JSON array: ${filePath}`, {
            code: "VALIDATION_ERROR",
        });
    }
    return parsed;
};

export class AdminImportService {
    async importFromSeedFiles(options: ImportOptions = {}): Promise<ImportResult> {
        const overwrite = Boolean(options.overwrite);

        const [flightRows, hotelRows, utilityRows] = await Promise.all([
            readJsonArray(FLIGHTS_SEED_PATH),
            readJsonArray(HOTELS_SEED_PATH),
            readJsonArray(UTILITIES_SEED_PATH),
        ]);

        const flights = flightRows.map((row) => CreateFlightDto.parse(row));
        const hotels = hotelRows.map((row) => CreateHotelDto.parse(row));
        const utilities = utilityRows.map((row) => {
            const typedRow = row as Record<string, unknown>;
            const type = UtilityTypeSchema.parse(typedRow.type);
            const payload = CreateUtilityServiceDto.parse(typedRow);
            return {
                ...payload,
                type,
            };
        });

        if (overwrite) {
            await Promise.all([
                FlightModel.deleteMany({}),
                HotelModel.deleteMany({}),
                UtilityModel.deleteMany({}),
            ]);

            if (flights.length > 0) {
                await FlightModel.insertMany(flights);
            }
            if (hotels.length > 0) {
                await HotelModel.insertMany(hotels);
            }
            if (utilities.length > 0) {
                await UtilityModel.insertMany(utilities);
            }
        } else {
            if (flights.length > 0) {
                await FlightModel.bulkWrite(
                    flights.map((flight) => ({
                        updateOne: {
                            filter: {
                                airline: flight.airline,
                                flightNumber: flight.flightNumber,
                                departure: flight.departure,
                            },
                            update: { $set: flight },
                            upsert: true,
                        },
                    }))
                );
            }
            if (hotels.length > 0) {
                await HotelModel.bulkWrite(
                    hotels.map((hotel) => ({
                        updateOne: {
                            filter: {
                                name: hotel.name,
                                city: hotel.city,
                                roomType: hotel.roomType,
                            },
                            update: { $set: hotel },
                            upsert: true,
                        },
                    }))
                );
            }
            if (utilities.length > 0) {
                await UtilityModel.bulkWrite(
                    utilities.map((utility) => ({
                        updateOne: {
                            filter: {
                                type: utility.type,
                                provider: utility.provider,
                                name: utility.name,
                                packageLabel: utility.packageLabel || "",
                            },
                            update: { $set: utility },
                            upsert: true,
                        },
                    }))
                );
            }
        }

        return {
            flights: { loaded: flights.length },
            hotels: { loaded: hotels.length },
            utilities: { loaded: utilities.length },
        };
    }
}

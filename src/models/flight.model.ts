import mongoose, { Document, Schema } from "mongoose";

export type FlightClass = "Economy" | "Business";

const flightSchema: Schema = new Schema(
    {
        airline: { type: String, required: true, trim: true },
        flightNumber: { type: String, required: true, trim: true },
        from: { type: String, required: true, trim: true },
        to: { type: String, required: true, trim: true },
        departure: { type: Date, required: true },
        arrival: { type: Date, required: true },
        durationMinutes: { type: Number, required: true, min: 1 },
        class: { type: String, enum: ["Economy", "Business"], required: true },
        price: { type: Number, required: true, min: 0 },
        seatsTotal: { type: Number, required: true, min: 1 },
        seatsAvailable: { type: Number, required: true, min: 0 },
        meta: { type: Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: true,
    }
);

flightSchema.index({ from: 1, to: 1, departure: 1 });
flightSchema.index({ departure: 1 });
flightSchema.index({ airline: 1, flightNumber: 1, departure: 1 }, { unique: true });

export interface IFlight extends Document {
    airline: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: Date;
    arrival: Date;
    durationMinutes: number;
    class: FlightClass;
    price: number;
    seatsTotal: number;
    seatsAvailable: number;
    meta?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export const FlightModel = mongoose.model<IFlight>("Flight", flightSchema);

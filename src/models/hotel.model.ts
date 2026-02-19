import mongoose, { Document, Schema } from "mongoose";

const hotelSchema: Schema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        roomType: { type: String, required: true, trim: true },
        roomsTotal: { type: Number, required: true, min: 1 },
        roomsAvailable: { type: Number, required: true, min: 0 },
        pricePerNight: { type: Number, required: true, min: 0 },
        amenities: { type: [String], default: [] },
        images: { type: [String], default: [] },
    },
    {
        timestamps: true,
    }
);

hotelSchema.index({ city: 1, name: 1 });
hotelSchema.index({ city: 1, roomsAvailable: 1 });
hotelSchema.index({ name: 1, city: 1, roomType: 1 }, { unique: true });

export interface IHotel extends Document {
    name: string;
    city: string;
    roomType: string;
    roomsTotal: number;
    roomsAvailable: number;
    pricePerNight: number;
    amenities: string[];
    images: string[];
    createdAt: Date;
    updatedAt: Date;
}

export const HotelModel = mongoose.model<IHotel>("Hotel", hotelSchema);

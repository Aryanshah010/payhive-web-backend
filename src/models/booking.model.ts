import mongoose, { Document, Schema } from "mongoose";

export type BookingType = "flight" | "hotel";
export type BookingStatus = "created" | "paid" | "cancelled" | "refunded";

const bookingSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: ["flight", "hotel"], required: true },
        itemId: { type: Schema.Types.ObjectId, required: true },
        snapshot: { type: Schema.Types.Mixed, required: true },
        quantity: { type: Number, required: true, min: 1 },
        nights: { type: Number, required: false, min: 1, default: null },
        price: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ["created", "paid", "cancelled", "refunded"],
            default: "created",
            index: true,
        },
        paymentTxnId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
        paidAt: { type: Date, default: null },
        paymentInProgress: { type: Boolean, default: false },
        reconciliationMeta: { type: Schema.Types.Mixed, default: null },
    },
    {
        timestamps: true,
    }
);

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ type: 1, itemId: 1 });

export interface IBooking extends Document {
    userId: mongoose.Types.ObjectId;
    type: BookingType;
    itemId: mongoose.Types.ObjectId;
    snapshot: Record<string, unknown>;
    quantity: number;
    nights?: number | null;
    price: number;
    status: BookingStatus;
    paymentTxnId?: mongoose.Types.ObjectId | null;
    paidAt?: Date | null;
    paymentInProgress?: boolean;
    reconciliationMeta?: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}

export const BookingModel = mongoose.model<IBooking>("Booking", bookingSchema);

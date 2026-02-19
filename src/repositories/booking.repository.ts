import { ClientSession } from "mongoose";
import { BookingModel, BookingStatus, BookingType, IBooking } from "../models/booking.model";

interface ListBookingsParams {
    userId: string;
    skip: number;
    limit: number;
    status?: BookingStatus;
    type?: BookingType;
}

export interface IBookingRepository {
    createBooking(data: Partial<IBooking>, session?: ClientSession): Promise<IBooking>;
    getBookingById(id: string): Promise<IBooking | null>;
    getBookingByIdForUser(id: string, userId: string): Promise<IBooking | null>;
    listByUser(params: ListBookingsParams): Promise<{ items: IBooking[]; total: number }>;
    claimForPayment(bookingId: string, userId: string, session?: ClientSession): Promise<IBooking | null>;
    markPaid(bookingId: string, paymentTxnId: string, session?: ClientSession): Promise<IBooking | null>;
    ensurePaidFromExistingTransaction(bookingId: string, paymentTxnId: string): Promise<IBooking | null>;
    releasePaymentClaim(bookingId: string, session?: ClientSession): Promise<IBooking | null>;
    setReconciliationMeta(
        bookingId: string,
        meta: Record<string, unknown>,
        session?: ClientSession
    ): Promise<IBooking | null>;
}

export class BookingRepository implements IBookingRepository {
    async createBooking(data: Partial<IBooking>, session?: ClientSession): Promise<IBooking> {
        const booking = new BookingModel(data);
        return await booking.save(session ? { session } : {});
    }

    async getBookingById(id: string): Promise<IBooking | null> {
        return BookingModel.findById(id);
    }

    async getBookingByIdForUser(id: string, userId: string): Promise<IBooking | null> {
        return BookingModel.findOne({ _id: id, userId });
    }

    async listByUser({ userId, skip, limit, status, type }: ListBookingsParams) {
        const query: Record<string, unknown> = { userId };
        if (status) {
            query.status = status;
        }
        if (type) {
            query.type = type;
        }

        const [items, total] = await Promise.all([
            BookingModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            BookingModel.countDocuments(query),
        ]);

        return { items, total };
    }

    async claimForPayment(bookingId: string, userId: string, session?: ClientSession): Promise<IBooking | null> {
        return BookingModel.findOneAndUpdate(
            {
                _id: bookingId,
                userId,
                status: "created",
                paymentInProgress: { $ne: true },
            },
            {
                $set: {
                    paymentInProgress: true,
                },
            },
            {
                new: true,
                ...(session ? { session } : {}),
            }
        );
    }

    async markPaid(bookingId: string, paymentTxnId: string, session?: ClientSession): Promise<IBooking | null> {
        return BookingModel.findOneAndUpdate(
            { _id: bookingId, status: "created" },
            {
                $set: {
                    status: "paid",
                    paymentTxnId,
                    paidAt: new Date(),
                    paymentInProgress: false,
                    reconciliationMeta: null,
                },
            },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    async ensurePaidFromExistingTransaction(bookingId: string, paymentTxnId: string): Promise<IBooking | null> {
        return BookingModel.findOneAndUpdate(
            {
                _id: bookingId,
                $or: [{ status: "created" }, { status: "paid" }],
            },
            {
                $set: {
                    status: "paid",
                    paymentTxnId,
                    paidAt: new Date(),
                    paymentInProgress: false,
                },
            },
            { new: true }
        );
    }

    async releasePaymentClaim(bookingId: string, session?: ClientSession): Promise<IBooking | null> {
        return BookingModel.findByIdAndUpdate(
            bookingId,
            { $set: { paymentInProgress: false } },
            { new: true, ...(session ? { session } : {}) }
        );
    }

    async setReconciliationMeta(
        bookingId: string,
        meta: Record<string, unknown>,
        session?: ClientSession
    ): Promise<IBooking | null> {
        return BookingModel.findByIdAndUpdate(
            bookingId,
            {
                $set: {
                    paymentInProgress: false,
                    reconciliationMeta: meta,
                },
            },
            { new: true, ...(session ? { session } : {}) }
        );
    }
}

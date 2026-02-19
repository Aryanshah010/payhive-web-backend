import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { BOOKING_PAYEE_USER_ID } from "../configs";
import { HttpError } from "../errors/http-error";
import { ITransaction } from "../models/transaction.model";
import { BookingRepository } from "../repositories/booking.repository";
import { FlightRepository } from "../repositories/flight.repository";
import { HotelRepository } from "../repositories/hotel.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UserRepository } from "../repositories/user.repository";
import { IUser } from "../models/user.model";

let bookingRepository = new BookingRepository();
let flightRepository = new FlightRepository();
let hotelRepository = new HotelRepository();
let userRepository = new UserRepository();
let transactionRepository = new TransactionRepository();

interface CreateBookingInput {
    type: "flight" | "hotel";
    itemId: string;
    quantity?: number;
    rooms?: number;
    nights?: number;
    checkin?: string;
    passengers?: { name: string }[];
}

interface BookingListInput {
    page: number;
    limit: number;
    status?: "created" | "paid" | "cancelled" | "refunded";
    type?: "flight" | "hotel";
}

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;

const isTransactionUnsupportedError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return (
        message.includes("transaction numbers are only allowed on a replica set member or mongos") ||
        message.includes("replica set") ||
        message.includes("transaction not supported")
    );
};

const namespacedBookingPayKey = (bookingId: string, idempotencyKey: string) =>
    `booking-pay:${bookingId}:${idempotencyKey}`;

export class BookingService {
    async createBooking(userId: string, input: CreateBookingInput) {
        if (input.type === "flight") {
            return this.createFlightBooking(userId, input);
        }

        return this.createHotelBooking(userId, input);
    }

    async listUserBookings(userId: string, query: BookingListInput) {
        const safePage = Math.max(1, query.page);
        const safeLimit = Math.max(1, Math.min(query.limit, 50));
        const skip = (safePage - 1) * safeLimit;

        const { items, total } = await bookingRepository.listByUser({
            userId,
            skip,
            limit: safeLimit,
            status: query.status,
            type: query.type,
        });

        const totalPages = Math.max(1, Math.ceil(total / safeLimit));
        return {
            items,
            total,
            page: safePage,
            limit: safeLimit,
            totalPages,
        };
    }

    async getUserBooking(userId: string, bookingId: string) {
        const booking = await bookingRepository.getBookingByIdForUser(bookingId, userId);
        if (!booking) {
            throw new HttpError(404, "Booking not found", { code: "NOT_FOUND" });
        }
        return booking;
    }

    async payBooking(userId: string, bookingId: string, rawIdempotencyKey?: string) {
        const booking = await bookingRepository.getBookingById(bookingId);
        if (!booking) {
            throw new HttpError(404, "Booking not found", { code: "NOT_FOUND" });
        }

        if (booking.userId.toString() !== userId) {
            throw new HttpError(403, "Forbidden", { code: "FORBIDDEN" });
        }

        const idempotencyKey = rawIdempotencyKey?.trim();
        const namespacedKey = idempotencyKey
            ? namespacedBookingPayKey(bookingId, idempotencyKey)
            : undefined;

        if (namespacedKey) {
            const existingTx = await transactionRepository.getBySenderAndIdempotencyKey(userId, namespacedKey);
            if (existingTx) {
                if (existingTx.bookingId && existingTx.bookingId.toString() !== bookingId) {
                    throw new HttpError(409, "Idempotency key already used with different payload", {
                        code: "IDEMPOTENCY_CONFLICT",
                    });
                }

                const healedBooking = await bookingRepository.ensurePaidFromExistingTransaction(
                    bookingId,
                    existingTx._id.toString()
                );
                const resolvedBooking = healedBooking ?? booking;

                return {
                    booking: resolvedBooking,
                    transactionId: existingTx._id.toString(),
                    idempotentReplay: true,
                };
            }
        }

        if (booking.status !== "created") {
            throw new HttpError(409, "Booking is not payable", { code: "BOOKING_NOT_PAYABLE" });
        }

        const claimedBooking = await bookingRepository.claimForPayment(bookingId, userId);
        if (!claimedBooking) {
            throw new HttpError(409, "Booking is not payable", { code: "BOOKING_NOT_PAYABLE" });
        }

        const amount = normalizeAmount(booking.price);
        const payee = await this.resolvePayee(userId);

        let releaseClaim = true;
        try {
            const transactionalResult = await this.payWithMongoTransaction({
                bookingId,
                userId,
                payeeId: payee._id.toString(),
                amount,
                idempotencyKey: namespacedKey,
            });

            releaseClaim = false;
            return transactionalResult;
        } catch (error: unknown) {
            if (!isTransactionUnsupportedError(error)) {
                throw error;
            }

            const fallbackResult = await this.payWithFallback({
                bookingId,
                userId,
                payeeId: payee._id.toString(),
                amount,
                idempotencyKey: namespacedKey,
            });
            releaseClaim = false;
            return fallbackResult;
        } finally {
            if (releaseClaim) {
                await bookingRepository.releasePaymentClaim(bookingId).catch(() => null);
            }
        }
    }

    private async createFlightBooking(userId: string, input: CreateBookingInput) {
        const quantity = input.quantity ?? 1;
        if (quantity <= 0) {
            throw new HttpError(400, "Quantity must be positive", { code: "VALIDATION_ERROR" });
        }

        const flight = await flightRepository.getFlightById(input.itemId);
        if (!flight) {
            throw new HttpError(404, "Flight not found", { code: "NOT_FOUND" });
        }

        if (flight.departure.getTime() <= Date.now()) {
            throw new HttpError(400, "Flight departure must be in the future", {
                code: "VALIDATION_ERROR",
            });
        }

        const reserved = await flightRepository.reserveSeats(input.itemId, quantity);
        if (!reserved) {
            throw new HttpError(409, "Requested seats not available", { code: "SOLD_OUT" });
        }

        const totalPrice = normalizeAmount(flight.price * quantity);

        try {
            const booking = await bookingRepository.createBooking({
                userId: new mongoose.Types.ObjectId(userId),
                type: "flight",
                itemId: new mongoose.Types.ObjectId(input.itemId),
                snapshot: {
                    flightId: flight._id.toString(),
                    airline: flight.airline,
                    flightNumber: flight.flightNumber,
                    from: flight.from,
                    to: flight.to,
                    departure: flight.departure,
                    arrival: flight.arrival,
                    class: flight.class,
                    unitPrice: flight.price,
                    passengers: input.passengers ?? [],
                },
                quantity,
                nights: null,
                price: totalPrice,
                status: "created",
            });

            return {
                bookingId: booking._id.toString(),
                status: booking.status,
                price: booking.price,
                payUrl: `/api/bookings/${booking._id.toString()}/pay`,
            };
        } catch (error) {
            await flightRepository.releaseSeats(input.itemId, quantity).catch(() => null);
            throw error;
        }
    }

    private async createHotelBooking(userId: string, input: CreateBookingInput) {
        const rooms = input.rooms ?? input.quantity ?? 1;
        const nights = input.nights ?? 1;
        if (rooms <= 0 || nights <= 0) {
            throw new HttpError(400, "Rooms and nights must be positive", {
                code: "VALIDATION_ERROR",
            });
        }

        if (!input.checkin) {
            throw new HttpError(400, "checkin is required", { code: "VALIDATION_ERROR" });
        }

        const checkinDate = new Date(`${input.checkin}T00:00:00.000Z`);
        if (Number.isNaN(checkinDate.getTime()) || checkinDate.getTime() <= Date.now()) {
            throw new HttpError(400, "checkin date must be in the future", {
                code: "VALIDATION_ERROR",
            });
        }

        const hotel = await hotelRepository.getHotelById(input.itemId);
        if (!hotel) {
            throw new HttpError(404, "Hotel not found", { code: "NOT_FOUND" });
        }

        const reserved = await hotelRepository.reserveRooms(input.itemId, rooms);
        if (!reserved) {
            throw new HttpError(409, "Requested rooms not available", {
                code: "INSUFFICIENT_AVAILABILITY",
            });
        }

        const totalPrice = normalizeAmount(hotel.pricePerNight * rooms * nights);

        try {
            const booking = await bookingRepository.createBooking({
                userId: new mongoose.Types.ObjectId(userId),
                type: "hotel",
                itemId: new mongoose.Types.ObjectId(input.itemId),
                snapshot: {
                    hotelId: hotel._id.toString(),
                    name: hotel.name,
                    city: hotel.city,
                    roomType: hotel.roomType,
                    checkin: input.checkin,
                    unitPrice: hotel.pricePerNight,
                },
                quantity: rooms,
                nights,
                price: totalPrice,
                status: "created",
            });

            return {
                bookingId: booking._id.toString(),
                status: booking.status,
                price: booking.price,
                payUrl: `/api/bookings/${booking._id.toString()}/pay`,
            };
        } catch (error) {
            await hotelRepository.releaseRooms(input.itemId, rooms).catch(() => null);
            throw error;
        }
    }

    private async resolvePayee(userId: string) {
        let payee: IUser | null = null;
        if (BOOKING_PAYEE_USER_ID) {
            const configuredPayee = await userRepository.getUserById(BOOKING_PAYEE_USER_ID);
            if (configuredPayee) {
                payee = configuredPayee;
            }
        }

        if (!payee) {
            payee = await userRepository.getFirstAdminUser();
        }

        if (!payee) {
            throw new HttpError(500, "Booking payee wallet not configured", {
                code: "PAYEE_NOT_CONFIGURED",
            });
        }

        if (payee._id.toString() === userId) {
            throw new HttpError(
                500,
                "Booking payee wallet cannot be the same as payer wallet. Configure BOOKING_PAYEE_USER_ID to a different user.",
                { code: "PAYEE_MISCONFIGURED" }
            );
        }

        return payee;
    }

    private async payWithMongoTransaction({
        bookingId,
        userId,
        payeeId,
        amount,
        idempotencyKey,
    }: {
        bookingId: string;
        userId: string;
        payeeId: string;
        amount: number;
        idempotencyKey?: string;
    }) {
        const session = await mongoose.startSession();
        let booking: any;
        let tx: ITransaction | null = null;
        let transactionId: string | null = null;

        try {
            await session.withTransaction(async () => {
                const debited = await userRepository.debitUser(userId, amount, session);
                if (!debited) {
                    throw new HttpError(402, "Top up your wallet", { code: "INSUFFICIENT_FUNDS" });
                }

                const credited = await userRepository.creditUser(payeeId, amount, session);
                if (!credited) {
                    throw new HttpError(500, "Failed to credit payee wallet");
                }

                tx = await transactionRepository.createTransaction(
                    {
                        from: new mongoose.Types.ObjectId(userId),
                        to: new mongoose.Types.ObjectId(payeeId),
                        amount,
                        remark: "Booking payment",
                        status: "SUCCESS",
                        txId: uuidv4(),
                        bookingId: new mongoose.Types.ObjectId(bookingId),
                        paymentType: "BOOKING_PAYMENT",
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    },
                    session
                );
                transactionId = tx._id.toString();

                booking = await bookingRepository.markPaid(bookingId, transactionId, session);
                if (!booking) {
                    throw new HttpError(500, "Failed to finalize booking payment");
                }
            });
        } finally {
            await session.endSession();
        }

        if (!tx || !booking || !transactionId) {
            throw new HttpError(500, "Payment failed");
        }

        return {
            booking,
            transactionId,
            idempotentReplay: false,
        };
    }

    private async payWithFallback({
        bookingId,
        userId,
        payeeId,
        amount,
        idempotencyKey,
    }: {
        bookingId: string;
        userId: string;
        payeeId: string;
        amount: number;
        idempotencyKey?: string;
    }) {
        let payerDebited = false;
        let payeeCredited = false;
        let paymentTx: ITransaction | null = null;

        try {
            const debited = await userRepository.debitUser(userId, amount);
            if (!debited) {
                throw new HttpError(402, "Top up your wallet", { code: "INSUFFICIENT_FUNDS" });
            }
            payerDebited = true;

            const credited = await userRepository.creditUser(payeeId, amount);
            if (!credited) {
                throw new HttpError(500, "Failed to credit payee wallet");
            }
            payeeCredited = true;

            paymentTx = await transactionRepository.createTransaction({
                from: new mongoose.Types.ObjectId(userId),
                to: new mongoose.Types.ObjectId(payeeId),
                amount,
                remark: "Booking payment",
                status: "SUCCESS",
                txId: uuidv4(),
                bookingId: new mongoose.Types.ObjectId(bookingId),
                paymentType: "BOOKING_PAYMENT",
                ...(idempotencyKey ? { idempotencyKey } : {}),
            });

            let booking = await bookingRepository.markPaid(bookingId, paymentTx._id.toString());
            if (!booking) {
                booking = await this.retryMarkPaid(bookingId, paymentTx._id.toString(), 2);
            }

            if (!booking) {
                throw new HttpError(500, "Failed to finalize booking payment");
            }

            return {
                booking,
                transactionId: paymentTx._id.toString(),
                idempotentReplay: false,
            };
        } catch (error: unknown) {
            if (paymentTx) {
                const healed = await bookingRepository.ensurePaidFromExistingTransaction(
                    bookingId,
                    paymentTx._id.toString()
                );
                if (healed) {
                    return {
                        booking: healed,
                        transactionId: paymentTx._id.toString(),
                        idempotentReplay: false,
                    };
                }
            }

            const compensationResult = await this.compensateFallbackFailure({
                bookingId,
                userId,
                payeeId,
                amount,
                payerDebited,
                payeeCredited,
                originalError: error,
            });

            if (!compensationResult.success) {
                throw new HttpError(500, "Payment reconciliation required", {
                    code: "PAYMENT_RECONCILIATION_REQUIRED",
                });
            }

            throw new HttpError(500, "Payment failed and was reversed", {
                code: "PAYMENT_REVERSED",
            });
        }
    }

    private async retryMarkPaid(bookingId: string, paymentTxnId: string, retries: number) {
        let booking = null;
        for (let attempt = 0; attempt < retries; attempt++) {
            booking = await bookingRepository.markPaid(bookingId, paymentTxnId);
            if (booking) {
                return booking;
            }
        }
        return null;
    }

    private async compensateFallbackFailure({
        bookingId,
        userId,
        payeeId,
        amount,
        payerDebited,
        payeeCredited,
        originalError,
    }: {
        bookingId: string;
        userId: string;
        payeeId: string;
        amount: number;
        payerDebited: boolean;
        payeeCredited: boolean;
        originalError: unknown;
    }) {
        let compensationOk = true;

        if (payeeCredited) {
            const reversedPayee = await userRepository.debitUser(payeeId, amount);
            if (!reversedPayee) {
                compensationOk = false;
            }
        }

        if (payerDebited) {
            const refundedUser = await userRepository.creditUser(userId, amount);
            if (!refundedUser) {
                compensationOk = false;
            }
        }

        if (compensationOk && payeeCredited && payerDebited) {
            await transactionRepository.createTransaction({
                from: new mongoose.Types.ObjectId(payeeId),
                to: new mongoose.Types.ObjectId(userId),
                amount,
                remark: "Compensation refund for booking payment failure",
                status: "SUCCESS",
                txId: uuidv4(),
                bookingId: new mongoose.Types.ObjectId(bookingId),
                paymentType: "BOOKING_REFUND_COMP",
            }).catch(() => null);
        }

        const errorMessage = originalError instanceof Error ? originalError.message : "Unknown payment error";
        await bookingRepository.setReconciliationMeta(bookingId, {
            failedAt: new Date().toISOString(),
            compensationOk,
            reason: errorMessage,
        });

        return { success: compensationOk };
    }
}

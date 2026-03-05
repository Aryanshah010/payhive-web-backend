import request from "supertest";
import app from "../../app";
import { cleanupTestData } from "../helpers/db";
import { makeUser } from "../helpers/data";
import { BookingModel } from "../../models/booking.model";
import { TransactionModel } from "../../models/transaction.model";
import { UserModel } from "../../models/user.model";
import * as configs from "../../configs";

const prefix = "itest-svc+";

const registerAndLogin = async (tag: string) => {
    const user = makeUser(prefix, tag);
    await request(app).post("/api/auth/register").send(user).expect(201);
    const loginRes = await request(app).post("/api/auth/login").send({
        phoneNumber: user.phoneNumber,
        password: user.password,
    });

    return {
        user,
        token: loginRes.body.token,
        id: loginRes.body.data._id,
    };
};

const promoteToAdmin = async (userId: string) => {
    await UserModel.findByIdAndUpdate(userId, { role: "admin" });
};

const normalizeAppliesTo = (values: string[]) => {
    const normalized = new Set<string>();
    for (const value of values) {
        if (value === "topup" || value === "recharge") {
            normalized.add("topup");
            normalized.add("recharge");
            continue;
        }
        normalized.add(value);
    }
    return normalized;
};

const createOrResolveFeeConfig = async (token: string, appliesTo: string[], fixedAmount: number) => {
    const createRes = await request(app)
        .post("/api/admin/fee-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({
            type: "service_payment",
            description: `${prefix} fee ${appliesTo.join("-")}`,
            calculation: { mode: "fixed", fixedAmount },
            appliesTo,
            isActive: true,
        });

    if (createRes.statusCode === 201) {
        return createRes.body.data.calculation.fixedAmount as number;
    }

    if (createRes.statusCode === 409 && createRes.body?.code === "FEE_CONFIG_OVERLAP") {
        const listRes = await request(app)
            .get("/api/admin/fee-configs?page=1&limit=50&type=service_payment&isActive=true")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        const requested = normalizeAppliesTo(appliesTo);
        const overlapping = (listRes.body.data.items || []).find((item: any) => {
            const itemAppliesTo = normalizeAppliesTo(item.appliesTo || []);
            for (const value of itemAppliesTo) {
                if (requested.has(value)) {
                    return true;
                }
            }
            return false;
        });

        if (!overlapping) {
            throw new Error("Fee config overlap reported but no overlapping active config found");
        }

        return overlapping.calculation.fixedAmount as number;
    }

    throw new Error(`Unexpected fee config response: ${createRes.statusCode}`);
};

const makeFutureIso = (daysAhead: number, hour: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
};

const buildFlightPayload = (tag: string, overrides: Record<string, unknown> = {}) => {
    const departure = makeFutureIso(3, 8);
    const arrival = makeFutureIso(3, 11);

    return {
        airline: `${prefix}Air-${tag}`,
        flightNumber: `${prefix}${tag}-FN`,
        from: `${prefix}From-${tag}`,
        to: `${prefix}To-${tag}`,
        departure,
        arrival,
        durationMinutes: 180,
        class: "Economy",
        price: 3500,
        seatsTotal: 10,
        seatsAvailable: 10,
        meta: { gate: "A1" },
        ...overrides,
    };
};

const buildHotelPayload = (tag: string, overrides: Record<string, unknown> = {}) => ({
    name: `${prefix}Hotel-${tag}`,
    city: `${prefix}City-${tag}`,
    roomType: `${prefix}Deluxe-${tag}`,
    roomsTotal: 12,
    roomsAvailable: 7,
    pricePerNight: 4200,
    amenities: ["wifi", "breakfast"],
    images: ["https://example.com/1.jpg"],
    ...overrides,
});

describe("Services + Booking Integration", () => {
    beforeEach(async () => {
        await cleanupTestData(prefix);
    });

    afterAll(async () => {
        await cleanupTestData(prefix);
    });

    test("admin CRUD for flights and hotels", async () => {
        const admin = await registerAndLogin("admin-crud");
        await promoteToAdmin(admin.id);

        const createFlightRes = await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildFlightPayload("crud"));

        expect(createFlightRes.statusCode).toBe(201);
        const flightId = createFlightRes.body.data._id;

        const getFlightRes = await request(app)
            .get(`/api/admin/flights/${flightId}`)
            .set("Authorization", `Bearer ${admin.token}`);
        expect(getFlightRes.statusCode).toBe(200);

        const updateFlightRes = await request(app)
            .put(`/api/admin/flights/${flightId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ price: 4100, seatsAvailable: 8 });
        expect(updateFlightRes.statusCode).toBe(200);
        expect(updateFlightRes.body.data.price).toBe(4100);

        const deleteFlightRes = await request(app)
            .delete(`/api/admin/flights/${flightId}`)
            .set("Authorization", `Bearer ${admin.token}`);
        expect(deleteFlightRes.statusCode).toBe(204);

        const createHotelRes = await request(app)
            .post("/api/admin/hotels")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildHotelPayload("crud"));

        expect(createHotelRes.statusCode).toBe(201);
        const hotelId = createHotelRes.body.data._id;

        const getHotelRes = await request(app)
            .get(`/api/admin/hotels/${hotelId}`)
            .set("Authorization", `Bearer ${admin.token}`);
        expect(getHotelRes.statusCode).toBe(200);

        const updateHotelRes = await request(app)
            .put(`/api/admin/hotels/${hotelId}`)
            .set("Authorization", `Bearer ${admin.token}`)
            .send({ pricePerNight: 5000, roomsAvailable: 5 });
        expect(updateHotelRes.statusCode).toBe(200);
        expect(updateHotelRes.body.data.pricePerNight).toBe(5000);

        const deleteHotelRes = await request(app)
            .delete(`/api/admin/hotels/${hotelId}`)
            .set("Authorization", `Bearer ${admin.token}`);
        expect(deleteHotelRes.statusCode).toBe(204);
    });

    test("public search endpoints support filters/pagination and availability", async () => {
        const admin = await registerAndLogin("admin-public");
        await promoteToAdmin(admin.id);

        const baseRouteFrom = `${prefix}RouteA`;
        const baseRouteTo = `${prefix}RouteB`;
        const earlierDeparture = makeFutureIso(4, 6);
        const laterDeparture = makeFutureIso(4, 11);

        await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(
                buildFlightPayload("public-early", {
                    from: baseRouteFrom,
                    to: baseRouteTo,
                    departure: earlierDeparture,
                    arrival: makeFutureIso(4, 8),
                })
            )
            .expect(201);

        await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(
                buildFlightPayload("public-late", {
                    from: baseRouteFrom,
                    to: baseRouteTo,
                    departure: laterDeparture,
                    arrival: makeFutureIso(4, 13),
                })
            )
            .expect(201);

        const dateOnly = earlierDeparture.slice(0, 10);
        const flightsRes = await request(app).get(
            `/api/flights?from=${encodeURIComponent(baseRouteFrom)}&to=${encodeURIComponent(baseRouteTo)}&date=${dateOnly}&page=1&limit=10`
        );

        expect(flightsRes.statusCode).toBe(200);
        expect(flightsRes.body.data.items.length).toBe(2);
        expect(new Date(flightsRes.body.data.items[0].departure).getTime()).toBeLessThan(
            new Date(flightsRes.body.data.items[1].departure).getTime()
        );

        const city = `${prefix}CityPublic`;
        await request(app)
            .post("/api/admin/hotels")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildHotelPayload("public-available", { city, roomsAvailable: 4 }))
            .expect(201);

        await request(app)
            .post("/api/admin/hotels")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildHotelPayload("public-zero", { city, roomsAvailable: 0 }))
            .expect(201);

        const hotelsRes = await request(app).get(
            `/api/hotels?city=${encodeURIComponent(city)}&checkin=2030-01-01&nights=2&page=1&limit=10`
        );

        expect(hotelsRes.statusCode).toBe(200);
        expect(hotelsRes.body.data.items.length).toBe(1);
        expect(hotelsRes.body.data.items[0].roomsAvailable).toBeGreaterThan(0);
    });

    test("booking create reserves availability atomically for flight and hotel", async () => {
        const admin = await registerAndLogin("admin-reserve");
        await promoteToAdmin(admin.id);
        const user = await registerAndLogin("user-reserve");

        const createFlightRes = await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildFlightPayload("reserve", { seatsTotal: 3, seatsAvailable: 3 }))
            .expect(201);
        const flightId = createFlightRes.body.data._id;

        const createBookingFlightRes = await request(app)
            .post("/api/bookings")
            .set("Authorization", `Bearer ${user.token}`)
            .send({ type: "flight", itemId: flightId, quantity: 2 });

        expect(createBookingFlightRes.statusCode).toBe(201);
        expect(createBookingFlightRes.body.data.price).toBe(7000);

        const flightDetailAfter = await request(app).get(`/api/flights/${flightId}`);
        expect(flightDetailAfter.body.data.seatsAvailable).toBe(1);

        const createHotelRes = await request(app)
            .post("/api/admin/hotels")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildHotelPayload("reserve", { roomsTotal: 5, roomsAvailable: 5, pricePerNight: 3000 }))
            .expect(201);
        const hotelId = createHotelRes.body.data._id;

        const createBookingHotelRes = await request(app)
            .post("/api/bookings")
            .set("Authorization", `Bearer ${user.token}`)
            .send({
                type: "hotel",
                itemId: hotelId,
                rooms: 2,
                nights: 2,
                checkin: "2030-01-01",
            });

        expect(createBookingHotelRes.statusCode).toBe(201);
        expect(createBookingHotelRes.body.data.price).toBe(12000);

        const hotelDetailAfter = await request(app).get(`/api/hotels/${hotelId}`);
        expect(hotelDetailAfter.body.data.roomsAvailable).toBe(3);
    });

    test("concurrent booking requests do not overbook", async () => {
        const admin = await registerAndLogin("admin-concurrency");
        await promoteToAdmin(admin.id);
        const user = await registerAndLogin("user-concurrency");

        const createFlightRes = await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(buildFlightPayload("concurrency", { seatsTotal: 1, seatsAvailable: 1 }))
            .expect(201);

        const flightId = createFlightRes.body.data._id;

        const results = await Promise.all([
            request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${user.token}`)
                .send({ type: "flight", itemId: flightId, quantity: 1 }),
            request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${user.token}`)
                .send({ type: "flight", itemId: flightId, quantity: 1 }),
            request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${user.token}`)
                .send({ type: "flight", itemId: flightId, quantity: 1 }),
        ]);

        const successCount = results.filter((res) => res.statusCode === 201).length;
        const soldOutCount = results.filter((res) => res.statusCode === 409).length;

        expect(successCount).toBe(1);
        expect(soldOutCount).toBe(2);

        const flightAfter = await request(app).get(`/api/flights/${flightId}`);
        expect(flightAfter.body.data.seatsAvailable).toBe(0);
    });

    test("pay booking success creates transaction and updates wallet atomically", async () => {
        const originalRevenueUserId = (configs as any).PLATFORM_REVENUE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-pay-success");
            await promoteToAdmin(admin.id);

            const revenue = await registerAndLogin("revenue-pay-success");
            await promoteToAdmin(revenue.id);
            (configs as any).PLATFORM_REVENUE_USER_ID = revenue.id;

            const user = await registerAndLogin("user-pay-success");
            const initialUserBalance = 100000;
            await UserModel.findByIdAndUpdate(user.id, { balance: initialUserBalance });

            const feeAmount = await createOrResolveFeeConfig(admin.token, ["flight"], 20);

            const createFlightRes = await request(app)
                .post("/api/admin/flights")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(buildFlightPayload("pay-success", { price: 2500, seatsTotal: 5, seatsAvailable: 5 }))
                .expect(201);

            const bookingRes = await request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${user.token}`)
                .send({ type: "flight", itemId: createFlightRes.body.data._id, quantity: 2 })
                .expect(201);

            const bookingId = bookingRes.body.data.bookingId;
            const balancesBefore = new Map<string, number>(
                (
                    await UserModel.find({}, { _id: 1, balance: 1 })
                        .lean()
                ).map((entry: any) => [entry._id.toString(), entry.balance as number])
            );
            const revenueBefore = await UserModel.findById(revenue.id);

            const payRes = await request(app)
                .post(`/api/bookings/${bookingId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .set("Idempotency-Key", "pay-success-key");

            expect(payRes.statusCode).toBe(200);
            expect(payRes.body.data.booking.status).toBe("paid");

            const userAfter = await UserModel.findById(user.id);
            const serviceAmount = 5000;
            const totalDebited = serviceAmount + feeAmount;
            expect(userAfter?.balance).toBe(initialUserBalance - totalDebited);

            const bookingDoc = await BookingModel.findById(bookingId);
            expect(bookingDoc?.status).toBe("paid");

            const txDoc = await TransactionModel.findById(payRes.body.data.transactionId);
            expect(txDoc?.paymentType).toBe("BOOKING_PAYMENT");
            expect(txDoc?.bookingId?.toString()).toBe(bookingId);
            expect(txDoc?.amount).toBe(totalDebited);
            expect(txDoc?.meta?.fee).toBe(feeAmount);
            expect(txDoc?.meta?.amount).toBe(serviceAmount);
            expect(txDoc?.meta?.totalDebited).toBe(totalDebited);
            expect(txDoc?.meta?.serviceType).toBe("flight");

            const payeeId = txDoc?.to?.toString();
            expect(payeeId).toBeTruthy();
            const payeeBeforeBalance = payeeId ? balancesBefore.get(payeeId) : undefined;
            expect(typeof payeeBeforeBalance).toBe("number");
            const payeeAfter = payeeId ? await UserModel.findById(payeeId) : null;
            expect(payeeAfter?.balance).toBe((payeeBeforeBalance as number) + serviceAmount);
            const revenueAfter = await UserModel.findById(revenue.id);
            expect(revenueAfter?.balance).toBe((revenueBefore?.balance || 0) + feeAmount);
        } finally {
            (configs as any).PLATFORM_REVENUE_USER_ID = originalRevenueUserId;
        }
    });

    test("pay booking fails when payee wallet resolves to payer wallet", async () => {
        const originalPayeeUserId = (configs as any).BOOKING_PAYEE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-payee-self");
            await promoteToAdmin(admin.id);
            await UserModel.findByIdAndUpdate(admin.id, { balance: 10000 });

            (configs as any).BOOKING_PAYEE_USER_ID = admin.id;

            const createFlightRes = await request(app)
                .post("/api/admin/flights")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(buildFlightPayload("payee-self", { price: 2200, seatsTotal: 5, seatsAvailable: 5 }))
                .expect(201);

            const bookingRes = await request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${admin.token}`)
                .send({ type: "flight", itemId: createFlightRes.body.data._id, quantity: 1 })
                .expect(201);

            const bookingId = bookingRes.body.data.bookingId;
            const balanceBefore = (await UserModel.findById(admin.id))?.balance;

            const payRes = await request(app)
                .post(`/api/bookings/${bookingId}/pay`)
                .set("Authorization", `Bearer ${admin.token}`);

            expect(payRes.statusCode).toBe(500);
            expect(payRes.body.code).toBe("PAYEE_MISCONFIGURED");
            expect(payRes.body.message).toContain("BOOKING_PAYEE_USER_ID");

            const balanceAfter = (await UserModel.findById(admin.id))?.balance;
            expect(balanceAfter).toBe(balanceBefore);

            const bookingDoc = await BookingModel.findById(bookingId);
            expect(bookingDoc?.status).toBe("created");
            expect(bookingDoc?.paymentTxnId).toBeNull();

            const paymentTx = await TransactionModel.findOne({
                bookingId: bookingDoc?._id,
                paymentType: "BOOKING_PAYMENT",
            });
            expect(paymentTx).toBeNull();
        } finally {
            (configs as any).BOOKING_PAYEE_USER_ID = originalPayeeUserId;
        }
    });

    test("insufficient balance prevents payment and idempotency avoids double charge", async () => {
        const originalRevenueUserId = (configs as any).PLATFORM_REVENUE_USER_ID;
        try {
            const admin = await registerAndLogin("admin-pay-fail");
            await promoteToAdmin(admin.id);

            const revenue = await registerAndLogin("revenue-pay-fail");
            await promoteToAdmin(revenue.id);
            (configs as any).PLATFORM_REVENUE_USER_ID = revenue.id;

            const user = await registerAndLogin("user-pay-fail");

            const feeAmount = await createOrResolveFeeConfig(admin.token, ["flight"], 20);
            const serviceAmount = 2000;
            const totalDebited = serviceAmount + feeAmount;
            const initialBalance = Math.max(0, totalDebited - 1);
            await UserModel.findByIdAndUpdate(user.id, { balance: initialBalance });

            const createFlightRes = await request(app)
                .post("/api/admin/flights")
                .set("Authorization", `Bearer ${admin.token}`)
                .send(buildFlightPayload("pay-fail", { price: serviceAmount }))
                .expect(201);

            const createBookingRes = await request(app)
                .post("/api/bookings")
                .set("Authorization", `Bearer ${user.token}`)
                .send({ type: "flight", itemId: createFlightRes.body.data._id, quantity: 1 })
                .expect(201);

            const bookingId = createBookingRes.body.data.bookingId;

            const insufficientRes = await request(app)
                .post(`/api/bookings/${bookingId}/pay`)
                .set("Authorization", `Bearer ${user.token}`);

            expect(insufficientRes.statusCode).toBe(402);
            expect(insufficientRes.body.code).toBe("INSUFFICIENT_FUNDS");

            const fundedBalance = totalDebited + 3000;
            await UserModel.findByIdAndUpdate(user.id, { balance: fundedBalance });

            const firstPayRes = await request(app)
                .post(`/api/bookings/${bookingId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .set("Idempotency-Key", "same-key");
            expect(firstPayRes.statusCode).toBe(200);

            const secondPayRes = await request(app)
                .post(`/api/bookings/${bookingId}/pay`)
                .set("Authorization", `Bearer ${user.token}`)
                .set("Idempotency-Key", "same-key");
            expect(secondPayRes.statusCode).toBe(200);
            expect(secondPayRes.body.data.idempotentReplay).toBe(true);

            const userAfter = await UserModel.findById(user.id);
            expect(userAfter?.balance).toBe(fundedBalance - totalDebited);
        } finally {
            (configs as any).PLATFORM_REVENUE_USER_ID = originalRevenueUserId;
        }
    });

    test("end-to-end flow search -> create booking -> pay -> booking list shows paid", async () => {
        const admin = await registerAndLogin("admin-e2e");
        await promoteToAdmin(admin.id);

        const user = await registerAndLogin("user-e2e");
        await UserModel.findByIdAndUpdate(user.id, { balance: 10000 });

        const routeFrom = `${prefix}From-e2e`;
        const routeTo = `${prefix}To-e2e`;
        const departure = makeFutureIso(5, 9);
        const dateOnly = departure.slice(0, 10);

        await request(app)
            .post("/api/admin/flights")
            .set("Authorization", `Bearer ${admin.token}`)
            .send(
                buildFlightPayload("e2e", {
                    from: routeFrom,
                    to: routeTo,
                    departure,
                    arrival: makeFutureIso(5, 11),
                    price: 3200,
                })
            )
            .expect(201);

        const searchRes = await request(app).get(
            `/api/flights?from=${encodeURIComponent(routeFrom)}&to=${encodeURIComponent(routeTo)}&date=${dateOnly}`
        );
        expect(searchRes.statusCode).toBe(200);
        expect(searchRes.body.data.items.length).toBeGreaterThan(0);

        const selectedFlight = searchRes.body.data.items[0];

        const createBookingRes = await request(app)
            .post("/api/bookings")
            .set("Authorization", `Bearer ${user.token}`)
            .send({ type: "flight", itemId: selectedFlight._id, quantity: 1 })
            .expect(201);

        const bookingId = createBookingRes.body.data.bookingId;

        await request(app)
            .post(`/api/bookings/${bookingId}/pay`)
            .set("Authorization", `Bearer ${user.token}`)
            .set("Idempotency-Key", "e2e-pay-key")
            .expect(200);

        const listBookingsRes = await request(app)
            .get("/api/bookings?page=1&limit=10")
            .set("Authorization", `Bearer ${user.token}`);

        expect(listBookingsRes.statusCode).toBe(200);
        expect(
            listBookingsRes.body.data.items.some(
                (item: any) => item._id === bookingId && item.status === "paid" && item.paymentTxnId
            )
        ).toBe(true);
    });
});

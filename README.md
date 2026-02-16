# PayHive Web Backend

Node.js + Express + TypeScript + MongoDB backend for authentication, wallet transfers, service catalogs (flights/hotels/internet/topup), booking, and utility wallet payments.

## Setup

```bash
npm install
cp .env.example .env   # if you have one
```

Required env vars (existing + new):

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL`
- `EMAIL_USER`
- `EMAIL_PASS`
- `MAX_TRANSFER_AMOUNT`
- `DAILY_TRANSFER_LIMIT`
- `MAX_PIN_ATTEMPTS`
- `PIN_LOCKOUT_MINUTES`
- `BOOKING_PAYEE_USER_ID` (optional; if empty, booking payments fall back to first admin user)

## Run

```bash
npm run dev
```

API base: `http://localhost:5050/api`

## Seed Flights/Hotels/Utilities

Seed files live in:

- `data/seeds/flights.json`
- `data/seeds/hotels.json`
- `data/seeds/utilities.json`

### CLI import

```bash
npm run seed:services
```

Overwrite existing flights/hotels:

```bash
npm run seed:services -- --overwrite
```

### Admin import API

`POST /api/admin/import` (admin only)

Body:

```json
{ "overwrite": false }
```

## Endpoints

### Admin (auth + admin role)

- `POST /api/admin/flights`
- `GET /api/admin/flights`
- `GET /api/admin/flights/:id`
- `PUT /api/admin/flights/:id`
- `DELETE /api/admin/flights/:id`

- `POST /api/admin/hotels`
- `GET /api/admin/hotels`
- `GET /api/admin/hotels/:id`
- `PUT /api/admin/hotels/:id`
- `DELETE /api/admin/hotels/:id`

- `POST /api/admin/import`

- `POST /api/admin/internet-services`
- `GET /api/admin/internet-services`
- `GET /api/admin/internet-services/:id`
- `PUT /api/admin/internet-services/:id`
- `DELETE /api/admin/internet-services/:id`

- `POST /api/admin/topup-services`
- `GET /api/admin/topup-services`
- `GET /api/admin/topup-services/:id`
- `PUT /api/admin/topup-services/:id`
- `DELETE /api/admin/topup-services/:id`

### Public

- `GET /api/flights?from=&to=&date=&page=&limit=`
- `GET /api/flights/:id`
- `GET /api/hotels?city=&checkin=&nights=&page=&limit=`
- `GET /api/hotels/:id`
- `GET /api/internet-services?provider=&search=&page=&limit=`
- `GET /api/internet-services/:id`
- `GET /api/topup-services?provider=&search=&page=&limit=`
- `GET /api/topup-services/:id`

### Bookings (auth required)

- `POST /api/bookings`
- `GET /api/bookings?page=&limit=&status=&type=`
- `GET /api/bookings/:id`
- `POST /api/bookings/:id/pay`
  - optional header: `Idempotency-Key`

### Utility Payments (auth required)

- `POST /api/internet-services/:id/pay`
  - body: `{ "customerId": "..." }`
  - optional header: `Idempotency-Key`
- `POST /api/topup-services/:id/pay`
  - body: `{ "phoneNumber": "9876543210" }`
  - optional header: `Idempotency-Key`

## Sample Requests

### Create flight booking

`POST /api/bookings`

```json
{
  "type": "flight",
  "itemId": "67caa0d8f3a4fce9e7f8b1aa",
  "quantity": 1
}
```

Success:

```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "bookingId": "67caa2a2a0f72ce2f1af1a7e",
    "status": "created",
    "price": 3500,
    "payUrl": "/api/bookings/67caa2a2a0f72ce2f1af1a7e/pay"
  }
}
```

Sold out:

```json
{
  "success": false,
  "code": "SOLD_OUT",
  "message": "Requested seats not available"
}
```

### Pay booking from wallet

`POST /api/bookings/:id/pay`

Success:

```json
{
  "success": true,
  "message": "Booking payment successful",
  "data": {
    "booking": {
      "id": "67caa2a2a0f72ce2f1af1a7e",
      "status": "paid",
      "paymentTxnId": "67caa2b2a0f72ce2f1af1a8f",
      "paidAt": "2026-02-16T10:30:00.000Z"
    },
    "transactionId": "67caa2b2a0f72ce2f1af1a8f",
    "idempotentReplay": false
  }
}
```

Insufficient funds:

```json
{
  "success": false,
  "code": "INSUFFICIENT_FUNDS",
  "message": "Top up your wallet"
}
```

## Notes

- Booking creation reserves inventory immediately (no wallet deduction at this stage).
- Payment endpoint is idempotent when `Idempotency-Key` is provided.
- Transaction-first strategy is used with MongoDB sessions; fallback compensation logic is used when transactions are unavailable.
- Utility payment receipts are stored in transaction `meta` and visible through `/api/transactions` history.

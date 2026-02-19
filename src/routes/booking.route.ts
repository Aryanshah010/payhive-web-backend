import { Router } from "express";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { BookingController } from "../controllers/booking.controller";

const router = Router();
const bookingController = new BookingController();

router.post("/", authorizedMiddleware, bookingController.createBooking);
router.get("/", authorizedMiddleware, bookingController.listBookings);
router.get("/:id", authorizedMiddleware, bookingController.getBooking);
router.post("/:id/pay", authorizedMiddleware, bookingController.payBooking);

export default router;

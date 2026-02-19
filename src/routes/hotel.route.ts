import { Router } from "express";
import { HotelController } from "../controllers/hotel.controller";

const router = Router();
const hotelController = new HotelController();

router.get("/", hotelController.listHotels);
router.get("/:id", hotelController.getHotel);

export default router;

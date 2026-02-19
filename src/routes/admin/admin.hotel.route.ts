import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminHotelController } from "../../controllers/admin/admin.hotel.controller";

const router = Router();
const adminHotelController = new AdminHotelController();

router.post("/", authorizedMiddleware, adminMiddleware, adminHotelController.createHotel);
router.get("/", authorizedMiddleware, adminMiddleware, adminHotelController.listHotels);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminHotelController.getHotel);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminHotelController.updateHotel);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminHotelController.deleteHotel);

export default router;

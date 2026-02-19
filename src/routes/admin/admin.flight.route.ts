import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminFlightController } from "../../controllers/admin/admin.flight.controller";

const router = Router();
const adminFlightController = new AdminFlightController();

router.post("/", authorizedMiddleware, adminMiddleware, adminFlightController.createFlight);
router.get("/", authorizedMiddleware, adminMiddleware, adminFlightController.listFlights);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminFlightController.getFlight);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminFlightController.updateFlight);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminFlightController.deleteFlight);

export default router;

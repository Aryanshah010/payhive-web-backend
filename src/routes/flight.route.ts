import { Router } from "express";
import { FlightController } from "../controllers/flight.controller";

const router = Router();
const flightController = new FlightController();

router.get("/", flightController.listFlights);
router.get("/:id", flightController.getFlight);

export default router;

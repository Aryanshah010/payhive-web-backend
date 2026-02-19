import { Router } from "express";
import { InternetServiceController } from "../controllers/internet-service.controller";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { UtilityPaymentController } from "../controllers/utility-payment.controller";

const router = Router();
const internetServiceController = new InternetServiceController();
const utilityPaymentController = new UtilityPaymentController();

router.get("/", internetServiceController.listServices);
router.get("/:id", internetServiceController.getService);
router.post("/:id/pay", authorizedMiddleware, utilityPaymentController.payInternet);

export default router;

import { Router } from "express";
import { TopupServiceController } from "../controllers/topup-service.controller";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { UtilityPaymentController } from "../controllers/utility-payment.controller";

const router = Router();
const topupServiceController = new TopupServiceController();
const utilityPaymentController = new UtilityPaymentController();

router.get("/", topupServiceController.listServices);
router.get("/:id", topupServiceController.getService);
router.post("/:id/pay", authorizedMiddleware, utilityPaymentController.payTopup);

export default router;

import { Router } from "express";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { MoneyRequestController } from "../controllers/money-request.controller";

const router = Router();
const moneyRequestController = new MoneyRequestController();

router.post("/", authorizedMiddleware, moneyRequestController.create);
router.get("/incoming", authorizedMiddleware, moneyRequestController.listIncoming);
router.get("/outgoing", authorizedMiddleware, moneyRequestController.listOutgoing);
router.get("/:requestId", authorizedMiddleware, moneyRequestController.getById);
router.post("/:requestId/respond", authorizedMiddleware, moneyRequestController.respond);
router.post("/:requestId/accept", authorizedMiddleware, moneyRequestController.accept);
router.post("/:requestId/reject", authorizedMiddleware, moneyRequestController.reject);
router.post("/:requestId/cancel", authorizedMiddleware, moneyRequestController.cancel);

export default router;

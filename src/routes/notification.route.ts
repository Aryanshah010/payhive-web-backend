import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { internalAuthMiddleware } from "../middlewares/internal-auth.middleware";

const router = Router();
const notificationController = new NotificationController();

router.post("/", internalAuthMiddleware, notificationController.createInternal);
router.get("/", authorizedMiddleware, notificationController.list);
router.patch("/read-all", authorizedMiddleware, notificationController.markAllRead);
router.patch("/:id/read", authorizedMiddleware, notificationController.markRead);

export default router;

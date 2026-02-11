import { Router } from "express";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { DeviceController } from "../controllers/device.controller";

const router = Router();
const deviceController = new DeviceController();

router.get("/", authorizedMiddleware, deviceController.listDevices);
router.get("/pending", authorizedMiddleware, deviceController.listPendingDevices);
router.post("/:deviceId/allow", authorizedMiddleware, deviceController.allowDevice);
router.post("/:deviceId/block", authorizedMiddleware, deviceController.blockDevice);

export default router;

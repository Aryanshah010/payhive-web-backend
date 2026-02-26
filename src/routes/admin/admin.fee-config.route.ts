import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminFeeConfigController } from "../../controllers/admin/admin.fee-config.controller";

const router = Router();
const adminFeeConfigController = new AdminFeeConfigController();

router.post("/", authorizedMiddleware, adminMiddleware, adminFeeConfigController.createConfig);
router.get("/", authorizedMiddleware, adminMiddleware, adminFeeConfigController.listConfigs);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminFeeConfigController.getConfig);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminFeeConfigController.updateConfig);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminFeeConfigController.deleteConfig);

export default router;

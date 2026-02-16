import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminTopupServiceController } from "../../controllers/admin/admin.topup-service.controller";

const router = Router();
const adminTopupServiceController = new AdminTopupServiceController();

router.post("/", authorizedMiddleware, adminMiddleware, adminTopupServiceController.createService);
router.get("/", authorizedMiddleware, adminMiddleware, adminTopupServiceController.listServices);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminTopupServiceController.getService);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminTopupServiceController.updateService);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminTopupServiceController.deleteService);

export default router;

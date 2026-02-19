import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminInternetServiceController } from "../../controllers/admin/admin.internet-service.controller";

const router = Router();
const adminInternetServiceController = new AdminInternetServiceController();

router.post("/", authorizedMiddleware, adminMiddleware, adminInternetServiceController.createService);
router.get("/", authorizedMiddleware, adminMiddleware, adminInternetServiceController.listServices);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminInternetServiceController.getService);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminInternetServiceController.updateService);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminInternetServiceController.deleteService);

export default router;

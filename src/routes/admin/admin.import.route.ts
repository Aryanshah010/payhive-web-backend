import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminImportController } from "../../controllers/admin/admin.import.controller";

const router = Router();
const adminImportController = new AdminImportController();

router.post("/", authorizedMiddleware, adminMiddleware, adminImportController.importSeeds);

export default router;

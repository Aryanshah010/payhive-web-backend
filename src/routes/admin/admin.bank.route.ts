import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware";
import { AdminBankController } from "../../controllers/admin/admin.bank.controller";

const router = Router();
const adminBankController = new AdminBankController();

router.post("/", authorizedMiddleware, adminMiddleware, adminBankController.createBank);
router.get("/", authorizedMiddleware, adminMiddleware, adminBankController.listBanks);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminBankController.updateBank);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminBankController.deleteBank);

export default router;

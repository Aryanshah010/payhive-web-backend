import { Router } from "express";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { TransactionController } from "../controllers/transaction.controller";

const router = Router();
const transactionController = new TransactionController();

router.post("/preview", authorizedMiddleware, transactionController.preview);
router.post("/confirm", authorizedMiddleware, transactionController.confirm);

export default router;

import { Router } from "express";
import { BankTransferController } from "../controllers/bank-transfer.controller";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";

const router = Router();
const bankTransferController = new BankTransferController();

router.post("/", authorizedMiddleware, bankTransferController.createTransfer);

export default router;

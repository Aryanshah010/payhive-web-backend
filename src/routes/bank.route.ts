import { Router } from "express";
import { BankController } from "../controllers/bank.controller";

const router = Router();
const bankController = new BankController();

router.get("/", bankController.listActiveBanks);

export default router;

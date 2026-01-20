import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";


const authController = new AuthController();

const router = Router();

router.post("/login", authController.loginUser);
router.post("/register", authController.createUser);

export default router;





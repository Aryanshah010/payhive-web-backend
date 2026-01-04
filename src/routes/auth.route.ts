import { Router,Request,Response } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";

const authController=new AuthController();

const router=Router();

router.post("/login",authController.loginUser);
router.post("/register",authController.createUser);

router.get("/test", authorizedMiddleware,(req: Request, res: Response) => {
    res.status(200).json({ success: true, message: "Welcome to dashboard after successfull JWT validation" });
});


export default router;





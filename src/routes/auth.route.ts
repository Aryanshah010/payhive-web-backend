import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { uploads } from "../middlewares/upload.middleware";
import { UserController } from "../controllers/user.controller";
import { authorizedMiddleware } from '../middlewares/authorized.middleware';

const authController = new AuthController();
const userController = new UserController();


const router = Router();

router.post("/login", authController.loginUser);
router.post("/register", authController.createUser);
router.post(
    "/profilePicture",
    authorizedMiddleware,
    uploads.single("profilePicture"),
    userController.updateProfilePicture
);


router.get(
    "/me",
    authorizedMiddleware,
    userController.getProfile
);

router.post("/request-password-reset", authController.sendResetPasswordEmail);
router.post("/reset-password/:token", authController.resetPassword);


export default router;



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
router.put(
    "/profilePicture",
    authorizedMiddleware,
    uploads.single("profilePicture"), // field name must match frontend FormData
    userController.updateProfilePicture
);

export default router;





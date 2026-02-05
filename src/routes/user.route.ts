import { Router } from "express";
import { uploads } from "../middlewares/upload.middleware";
import { UserController } from "../controllers/user.controller";
import { authorizedMiddleware } from '../middlewares/authorized.middleware';

const userController = new UserController();

const router = Router();

router.put('/updateProfile', authorizedMiddleware, uploads.single('profilePicture'), userController.updateProfile);
router.put('/pin', authorizedMiddleware, userController.updatePin);

export default router;

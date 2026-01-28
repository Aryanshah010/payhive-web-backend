import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware"
import { Request, Response } from "express";
import { AdminUserController } from "../../controllers/admin/admin.user.controller";

let adminUserController = new AdminUserController();

const router = Router();


router.post("/", authorizedMiddleware, adminMiddleware, adminUserController.createUser);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminUserController.getOneUser);
router.get("/", authorizedMiddleware, adminMiddleware, adminUserController.getAllUsers);
router.put("/:id", authorizedMiddleware, adminMiddleware, adminUserController.updateOneUser);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminUserController.deleteOneUser);

export default router;
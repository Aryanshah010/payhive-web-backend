import { Router } from "express";
import { adminMiddleware, authorizedMiddleware } from "../../middlewares/authorized.middleware"
import { AdminUserController } from "../../controllers/admin/admin.user.controller";
import { uploads } from "../../middlewares/upload.middleware";

let adminUserController = new AdminUserController();

const router = Router();


router.post("/", authorizedMiddleware, adminMiddleware, uploads.single("profilePicture"), adminUserController.createUser);
router.get("/:id", authorizedMiddleware, adminMiddleware, adminUserController.getOneUser);
router.get("/", authorizedMiddleware, adminMiddleware, adminUserController.getAllUsers);
router.put("/:id", authorizedMiddleware, adminMiddleware, uploads.single("profilePicture"), adminUserController.updateOneUser);
router.delete("/:id", authorizedMiddleware, adminMiddleware, adminUserController.deleteOneUser);

export default router;
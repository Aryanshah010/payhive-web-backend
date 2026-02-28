import { Router } from "express";
import { authorizedMiddleware } from "../middlewares/authorized.middleware";
import { UndoRequestController } from "../controllers/undo-request.controller";

const router = Router();
const undoRequestController = new UndoRequestController();

router.post("/", authorizedMiddleware, undoRequestController.create);
router.post("/:requestId/accept", authorizedMiddleware, undoRequestController.accept);
router.post("/:requestId/reject", authorizedMiddleware, undoRequestController.reject);

export default router;

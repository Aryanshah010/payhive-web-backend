import { Router } from 'express';
import { AdminDashboardController } from '../../controllers/admin/admin.dashboard.controller';
import { authorizedMiddleware, adminMiddleware } from '../../middlewares/authorized.middleware';

let adminDashboardController = new AdminDashboardController();

const router = Router();

router.get('/', authorizedMiddleware, adminMiddleware, (req, res) =>
    adminDashboardController.getDashboard(req, res),
);

export default router;

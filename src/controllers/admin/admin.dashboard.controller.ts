import { Request, Response } from 'express';
import { HttpError } from '../../errors/http-error';
import { AdminDashboardService } from '../../services/admin/admin.dashboard.service';
import { GetDashboardQueryDto } from '../../dtos/admin-dashboard.dto';

let adminDashboardService = new AdminDashboardService();

export class AdminDashboardController {
    async getDashboard(req: Request, res: Response): Promise<void> {
        try {
            const queryValidation = GetDashboardQueryDto.safeParse({
                range: req.query.range || '6m',
            });

            if (!queryValidation.success) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid query parameters',
                    details: queryValidation.error.flatten(),
                });
                return;
            }

            const { range } = queryValidation.data;
            const dashboard = await adminDashboardService.getDashboard(range);

            res.status(200).json({
                success: true,
                message: 'Dashboard metrics retrieved successfully',
                data: dashboard,
            });
        } catch (error) {
            if (error instanceof HttpError) {
                res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                });
            }
        }
    }
}

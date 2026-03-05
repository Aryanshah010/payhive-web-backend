import { z } from 'zod';
import { DashboardRangeSchema } from '../types/admin-dashboard.type';

export const GetDashboardQueryDto = z.object({
  range: DashboardRangeSchema,
});

export type GetDashboardQueryDto = z.infer<typeof GetDashboardQueryDto>;

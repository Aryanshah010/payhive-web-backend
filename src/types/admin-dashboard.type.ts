import { z } from 'zod';

export const DashboardRangeSchema = z.enum(['6m', '30d', '90d']).optional().default('6m');

export const DashboardKPIsSchema = z.object({
  totalUsers: z.number().min(0),
  totalTransactions: z.number().min(0),
  totalTransactionAmount: z.number().min(0),
  totalRevenue: z.number().min(0),
  avgRevenuePerTransaction: z.number().min(0),
});

export const MonthlySeriesSchema = z.object({
  monthLabel: z.string(),
  month: z.number(),
  year: z.number(),
  revenue: z.number().min(0),
  transactions: z.number().min(0),
});

export const DashboardDataSchema = z.object({
  generatedAt: z.string().datetime(),
  currency: z.literal('NPR'),
  kpis: DashboardKPIsSchema,
  monthlySeries: z.array(MonthlySeriesSchema),
});

export type DashboardRange = z.infer<typeof DashboardRangeSchema>;
export type DashboardKPIs = z.infer<typeof DashboardKPIsSchema>;
export type MonthlySeries = z.infer<typeof MonthlySeriesSchema>;
export type DashboardData = z.infer<typeof DashboardDataSchema>;

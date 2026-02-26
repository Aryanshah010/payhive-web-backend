import { TransactionRepository } from '../../repositories/transaction.repository';
import { UserRepository } from '../../repositories/user.repository';
import { DashboardRange, DashboardData } from '../../types/admin-dashboard.type';
import { UserModel } from '../../models/user.model';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class AdminDashboardService {
    private transactionRepository: TransactionRepository;
    private userRepository: UserRepository;

    constructor(
        transactionRepository?: TransactionRepository,
        userRepository?: UserRepository,
    ) {
        this.transactionRepository = transactionRepository || new TransactionRepository();
        this.userRepository = userRepository || new UserRepository();
    }

    async getDashboard(range: DashboardRange): Promise<DashboardData> {
        const { startDate, endDate } = this.getDateRange(range);

        // Parallel queries
        const [metrics, totalUsers] = await Promise.all([
            this.transactionRepository.getDashboardMetrics(startDate, endDate),
            UserModel.countDocuments({}),
        ]);

        // Fill missing months with zeros
        const monthlySeries = this.fillMissingMonths(metrics.monthlyData, startDate, endDate);

        const avgRevenuePerTransaction =
            metrics.totalTransactions > 0
                ? Math.round(metrics.totalRevenue / metrics.totalTransactions * 100) / 100
                : 0;

        return {
            generatedAt: new Date().toISOString(),
            currency: 'NPR',
            kpis: {
                totalUsers,
                totalTransactions: metrics.totalTransactions,
                totalTransactionAmount: metrics.totalTransactionAmount,
                totalRevenue: metrics.totalRevenue,
                avgRevenuePerTransaction,
            },
            monthlySeries,
        };
    }

    private getDateRange(range: DashboardRange): { startDate: Date; endDate: Date } {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date();

        if (range === '6m') {
            startDate.setMonth(startDate.getMonth() - 6);
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
        } else if (range === '90d') {
            startDate.setDate(startDate.getDate() - 90);
        }

        // Set to first day of month at 00:00:00
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        return { startDate, endDate };
    }

    private fillMissingMonths(
        monthlyData: Array<{ year: number; month: number; transactions: number; revenue: number }>,
        startDate: Date,
        endDate: Date,
    ): Array<{
        monthLabel: string;
        month: number;
        year: number;
        revenue: number;
        transactions: number;
    }> {
        const result = [];
        const current = new Date(startDate);

        while (current <= endDate) {
            const year = current.getFullYear();
            const month = current.getMonth() + 1;

            const data = monthlyData.find((m) => m.year === year && m.month === month) || {
                year,
                month,
                transactions: 0,
                revenue: 0,
            };

            result.push({
                monthLabel: MONTH_LABELS[month - 1],
                month,
                year,
                revenue: data.revenue,
                transactions: data.transactions,
            });

            current.setMonth(current.getMonth() + 1);
        }

        return result;
    }
}

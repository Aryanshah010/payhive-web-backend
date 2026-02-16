import { Request, Response } from "express";
import z from "zod";
import { AdminImportService } from "../../services/admin/admin.import.service";

const ImportRequestSchema = z.object({
    overwrite: z.boolean().optional().default(false),
});

let adminImportService = new AdminImportService();

const sendError = (res: Response, error: unknown) => {
    const err = error as any;
    return res.status(err.statusCode || 500).json({
        success: false,
        code: err?.details?.code || "INTERNAL_ERROR",
        message: err.message || "Internal Server Error",
        ...(err?.details?.data ? { data: err.details.data } : {}),
    });
};

export class AdminImportController {
    async importSeeds(req: Request, res: Response) {
        try {
            const parsedBody = ImportRequestSchema.safeParse(req.body ?? {});
            if (!parsedBody.success) {
                return res.status(400).json({
                    success: false,
                    code: "VALIDATION_ERROR",
                    message: z.prettifyError(parsedBody.error),
                });
            }

            const data = await adminImportService.importFromSeedFiles({
                overwrite: parsedBody.data.overwrite,
            });

            return res.status(200).json({
                success: true,
                message: "Seed import completed",
                data,
            });
        } catch (error) {
            return sendError(res, error);
        }
    }
}

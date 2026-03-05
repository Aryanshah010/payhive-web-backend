import { NextFunction, Request, Response } from "express";
import { INTERNAL_NOTIFICATION_SECRET } from "../configs";

export const internalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!INTERNAL_NOTIFICATION_SECRET) {
        return res.status(500).json({
            success: false,
            message: "Internal notification secret is not configured",
        });
    }

    const provided = req.header("X-Internal-Token") || req.header("x-internal-token");
    if (!provided || provided !== INTERNAL_NOTIFICATION_SECRET) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized internal request",
        });
    }

    return next();
};

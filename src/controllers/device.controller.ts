import { Request, Response } from "express";
import { DeviceService } from "../services/device.service";
import { HttpError } from "../errors/http-error";
import z from "zod";

const deviceService = new DeviceService();
const DeviceStatusSchema = z.enum(["ALLOWED", "PENDING", "BLOCKED"]);

export class DeviceController {
    async listDevices(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const statusRaw = req.query.status as string | undefined;
            let status: "ALLOWED" | "PENDING" | "BLOCKED" | undefined;
            if (statusRaw) {
                const parsed = DeviceStatusSchema.safeParse(statusRaw.toUpperCase());
                if (!parsed.success) {
                    return res.status(400).json({ success: false, message: "Invalid status filter" });
                }
                status = parsed.data;
            }

            const devices = await deviceService.listDevices(userId.toString(), status);
            return res.status(200).json({ success: true, data: devices });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async listPendingDevices(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const devices = await deviceService.listDevices(userId.toString(), "PENDING");
            return res.status(200).json({ success: true, data: devices });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async allowDevice(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const deviceId = req.params.deviceId;
            if (!deviceId) {
                throw new HttpError(400, "Device ID is required");
            }

            const device = await deviceService.allowDevice(userId.toString(), deviceId);
            return res.status(200).json({ success: true, data: device, message: "Device allowed" });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async blockDevice(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(400).json({ success: false, message: "User ID not provided" });
            }

            const deviceId = req.params.deviceId;
            if (!deviceId) {
                throw new HttpError(400, "Device ID is required");
            }

            const device = await deviceService.blockDevice(userId.toString(), deviceId);
            return res.status(200).json({ success: true, data: device, message: "Device blocked" });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }
}

import { v4 as uuidv4 } from "uuid";
import { DeviceRepository } from "../repositories/device.repository";
import { DeviceStatus, IDevice } from "../models/device.model";
import { IUser } from "../models/user.model";
import { HttpError } from "../errors/http-error";
import { sendEmail } from "../configs/email";

let deviceRepository = new DeviceRepository();

export interface DeviceLoginResult {
    status: DeviceStatus;
    deviceId: string;
    approvalRequired?: boolean;
}

export class DeviceService {
    private createDeviceId() {
        return uuidv4();
    }

    async processLogin(
        user: IUser,
        deviceId?: string,
        deviceName?: string,
        userAgent?: string
    ): Promise<DeviceLoginResult> {
        const now = new Date();
        const existingCount = await deviceRepository.countByUser(user._id.toString());

        if (deviceId) {
            const existingDevice = await deviceRepository.getByUserAndDeviceId(
                user._id.toString(),
                deviceId
            );

            if (existingDevice) {
                if (existingDevice.status === "ALLOWED") {
                    await deviceRepository.updateById(existingDevice._id.toString(), {
                        lastSeenAt: now,
                        ...(deviceName ? { deviceName } : {}),
                        ...(userAgent ? { userAgent } : {}),
                    });

                    return { status: "ALLOWED", deviceId: existingDevice.deviceId };
                }

                return {
                    status: existingDevice.status,
                    deviceId: existingDevice.deviceId,
                    ...(existingDevice.status === "PENDING" ? { approvalRequired: true } : {}),
                };
            }
        }

        if (existingCount === 0) {
            const newDeviceId = this.createDeviceId();
            await deviceRepository.createDevice({
                userId: user._id,
                deviceId: newDeviceId,
                deviceName: deviceName || null,
                userAgent: userAgent || null,
                status: "ALLOWED",
                lastSeenAt: now,
                allowedAt: now,
            });

            return { status: "ALLOWED", deviceId: newDeviceId };
        }

        const pendingDeviceId = this.createDeviceId();
        await deviceRepository.createDevice({
            userId: user._id,
            deviceId: pendingDeviceId,
            deviceName: deviceName || null,
            userAgent: userAgent || null,
            status: "PENDING",
            lastSeenAt: now,
        });

        try {
            const html = `
                <p>New device login attempt detected.</p>
                <p><strong>Device:</strong> ${deviceName || "Unknown"}</p>
                <p><strong>User-Agent:</strong> ${userAgent || "Unknown"}</p>
                <p>Please approve or block this device in your app.</p>
            `;
            await sendEmail(user.email, "New device login attempt", html);
        } catch (error) {
            console.error("Failed to send device alert email:", error);
        }

        return { status: "PENDING", deviceId: pendingDeviceId, approvalRequired: true };
    }

    async listDevices(userId: string, status?: DeviceStatus): Promise<IDevice[]> {
        return deviceRepository.listByUser(userId, status);
    }

    async allowDevice(userId: string, deviceId: string): Promise<IDevice> {
        const now = new Date();
        const updated = await deviceRepository.updateStatus(userId, deviceId, "ALLOWED", {
            allowedAt: now,
            blockedAt: null,
            lastSeenAt: now,
        });

        if (!updated) {
            throw new HttpError(404, "Device not found");
        }

        return updated;
    }

    async blockDevice(userId: string, deviceId: string): Promise<IDevice> {
        const now = new Date();
        const updated = await deviceRepository.updateStatus(userId, deviceId, "BLOCKED", {
            blockedAt: now,
        });

        if (!updated) {
            throw new HttpError(404, "Device not found");
        }

        return updated;
    }
}

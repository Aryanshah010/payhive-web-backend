import { DeviceModel, IDevice, DeviceStatus } from "../models/device.model";

export interface IDeviceRepository {
    createDevice(data: Partial<IDevice>): Promise<IDevice>;
    getByUserAndDeviceId(userId: string, deviceId: string): Promise<IDevice | null>;
    getLatestByFingerprint(userId: string, deviceName: string, userAgent: string): Promise<IDevice | null>;
    listByUser(userId: string, status?: DeviceStatus): Promise<IDevice[]>;
    countByUser(userId: string): Promise<number>;
    updateById(id: string, data: Partial<IDevice>): Promise<IDevice | null>;
    updateStatus(userId: string, deviceId: string, status: DeviceStatus, data?: Partial<IDevice>): Promise<IDevice | null>;
}

export class DeviceRepository implements IDeviceRepository {
    async createDevice(data: Partial<IDevice>): Promise<IDevice> {
        const device = new DeviceModel(data);
        return await device.save();
    }

    async getByUserAndDeviceId(userId: string, deviceId: string): Promise<IDevice | null> {
        return DeviceModel.findOne({ userId, deviceId });
    }

    async getLatestByFingerprint(userId: string, deviceName: string, userAgent: string): Promise<IDevice | null> {
        return DeviceModel.findOne({
            userId,
            deviceName,
            userAgent,
        }).sort({ createdAt: -1 });
    }

    async listByUser(userId: string, status?: DeviceStatus): Promise<IDevice[]> {
        const query: Record<string, any> = { userId };
        if (status) {
            query.status = status;
        }

        return DeviceModel.find(query).sort({ createdAt: -1 });
    }

    async countByUser(userId: string): Promise<number> {
        return DeviceModel.countDocuments({ userId });
    }

    async updateById(id: string, data: Partial<IDevice>): Promise<IDevice | null> {
        return DeviceModel.findByIdAndUpdate(id, data, { new: true });
    }

    async updateStatus(userId: string, deviceId: string, status: DeviceStatus, data: Partial<IDevice> = {}) {
        return DeviceModel.findOneAndUpdate(
            { userId, deviceId },
            { status, ...data },
            { new: true }
        );
    }
}

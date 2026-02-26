import { FeeConfigModel, IFeeConfig } from "../models/fee-config.model";

export interface IFeeConfigRepository {
    createConfig(data: Partial<IFeeConfig>): Promise<IFeeConfig>;
    listConfigs(params: {
        skip: number;
        limit: number;
        type?: string;
        appliesTo?: string;
        isActive?: boolean;
    }): Promise<{ items: IFeeConfig[]; total: number }>;
    getById(id: string): Promise<IFeeConfig | null>;
    updateConfig(id: string, data: Partial<IFeeConfig>): Promise<IFeeConfig | null>;
    deleteConfig(id: string): Promise<boolean>;
    findActiveByTypeAndAppliesTo(type: string, appliesTo: string[]): Promise<IFeeConfig | null>;
    findOverlappingActive(type: string, appliesTo: string[], excludeId?: string): Promise<IFeeConfig | null>;
}

export class FeeConfigRepository implements IFeeConfigRepository {
    async createConfig(data: Partial<IFeeConfig>): Promise<IFeeConfig> {
        const config = new FeeConfigModel(data);
        return config.save();
    }

    async listConfigs({ skip, limit, type, appliesTo, isActive }: {
        skip: number;
        limit: number;
        type?: string;
        appliesTo?: string;
        isActive?: boolean;
    }) {
        const query: Record<string, unknown> = {};
        if (type) {
            query.type = type;
        }
        if (appliesTo) {
            query.appliesTo = appliesTo;
        }
        if (typeof isActive === "boolean") {
            query.isActive = isActive;
        }

        const itemsPromise = FeeConfigModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        const countPromise = FeeConfigModel.countDocuments(query);

        const [items, total] = await Promise.all([itemsPromise, countPromise]);
        return { items, total };
    }

    async getById(id: string): Promise<IFeeConfig | null> {
        return FeeConfigModel.findById(id);
    }

    async updateConfig(id: string, data: Partial<IFeeConfig>): Promise<IFeeConfig | null> {
        return FeeConfigModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    }

    async deleteConfig(id: string): Promise<boolean> {
        const result = await FeeConfigModel.findByIdAndDelete(id);
        return Boolean(result);
    }

    async findActiveByTypeAndAppliesTo(type: string, appliesTo: string[]): Promise<IFeeConfig | null> {
        return FeeConfigModel.findOne({
            type,
            isActive: true,
            appliesTo: { $in: appliesTo },
        }).sort({ createdAt: -1 });
    }

    async findOverlappingActive(type: string, appliesTo: string[], excludeId?: string): Promise<IFeeConfig | null> {
        const query: Record<string, unknown> = {
            type,
            isActive: true,
            appliesTo: { $in: appliesTo },
        };

        if (excludeId) {
            query._id = { $ne: excludeId };
        }

        return FeeConfigModel.findOne(query);
    }
}

import { UtilityType, IUtility, UtilityModel } from "../models/utility.model";

interface UtilityListParams {
    type: UtilityType;
    page: number;
    limit: number;
    provider?: string;
    search?: string;
    isActive?: boolean;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface IUtilityRepository {
    createService(type: UtilityType, data: Partial<IUtility>): Promise<IUtility>;
    getById(id: string): Promise<IUtility | null>;
    getByIdAndType(id: string, type: UtilityType): Promise<IUtility | null>;
    listByType(params: UtilityListParams): Promise<{ items: IUtility[]; total: number }>;
    updateService(id: string, type: UtilityType, data: Partial<IUtility>): Promise<IUtility | null>;
    deleteService(id: string, type: UtilityType): Promise<boolean>;
}

export class UtilityRepository implements IUtilityRepository {
    async createService(type: UtilityType, data: Partial<IUtility>): Promise<IUtility> {
        const utility = new UtilityModel({
            ...data,
            type,
        });
        return utility.save();
    }

    async getById(id: string): Promise<IUtility | null> {
        return UtilityModel.findById(id);
    }

    async getByIdAndType(id: string, type: UtilityType): Promise<IUtility | null> {
        return UtilityModel.findOne({ _id: id, type });
    }

    async listByType({
        type,
        page,
        limit,
        provider = "",
        search = "",
        isActive,
    }: UtilityListParams): Promise<{ items: IUtility[]; total: number }> {
        const query: Record<string, unknown> = {
            type,
        };

        if (provider.trim().length > 0) {
            query.provider = { $regex: escapeRegex(provider.trim()), $options: "i" };
        }
        if (search.trim().length > 0) {
            const pattern = { $regex: escapeRegex(search.trim()), $options: "i" };
            query.$or = [{ provider: pattern }, { name: pattern }, { packageLabel: pattern }];
        }
        if (typeof isActive === "boolean") {
            query.isActive = isActive;
        }

        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            UtilityModel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            UtilityModel.countDocuments(query),
        ]);

        return { items, total };
    }

    async updateService(id: string, type: UtilityType, data: Partial<IUtility>): Promise<IUtility | null> {
        return UtilityModel.findOneAndUpdate(
            { _id: id, type },
            { $set: data },
            { new: true }
        );
    }

    async deleteService(id: string, type: UtilityType): Promise<boolean> {
        const result = await UtilityModel.findOneAndDelete({ _id: id, type });
        return Boolean(result);
    }
}

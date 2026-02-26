import { CreateFeeConfigDto, UpdateFeeConfigDto } from "../../dtos/fee-config.dto";
import { HttpError } from "../../errors/http-error";
import { FeeConfigRepository } from "../../repositories/fee-config.repository";

let feeConfigRepository = new FeeConfigRepository();

const buildOverlapAppliesTo = (values: string[]) => {
    const normalized = new Set<string>();
    for (const value of values) {
        if (value === "recharge" || value === "topup") {
            normalized.add("topup");
            normalized.add("recharge");
        } else {
            normalized.add(value);
        }
    }
    return Array.from(normalized);
};

const ensureNoOverlap = async (type: string, appliesTo: string[], excludeId?: string) => {
    const overlapAppliesTo = buildOverlapAppliesTo(appliesTo);
    const overlap = await feeConfigRepository.findOverlappingActive(type, overlapAppliesTo, excludeId);
    if (overlap) {
        throw new HttpError(409, "Fee config already exists for one of the appliesTo values", {
            code: "FEE_CONFIG_OVERLAP",
        });
    }
};

export class AdminFeeConfigService {
    async createConfig(data: CreateFeeConfigDto) {
        if (data.isActive) {
            await ensureNoOverlap(data.type, data.appliesTo);
        }

        return feeConfigRepository.createConfig({
            ...data,
            appliesTo: data.appliesTo,
        });
    }

    async listConfigs({
        page,
        limit,
        type,
        appliesTo,
        isActive,
    }: {
        page: number;
        limit: number;
        type?: string;
        appliesTo?: string;
        isActive?: boolean;
    }) {
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 50));
        const skip = (safePage - 1) * safeLimit;

        const { items, total } = await feeConfigRepository.listConfigs({
            skip,
            limit: safeLimit,
            type,
            appliesTo,
            isActive,
        });

        const totalPages = Math.max(1, Math.ceil(total / safeLimit));
        return { items, total, page: safePage, limit: safeLimit, totalPages };
    }

    async getConfig(id: string) {
        const config = await feeConfigRepository.getById(id);
        if (!config) {
            throw new HttpError(404, "Fee config not found", { code: "NOT_FOUND" });
        }
        return config;
    }

    async updateConfig(id: string, data: UpdateFeeConfigDto) {
        const existing = await feeConfigRepository.getById(id);
        if (!existing) {
            throw new HttpError(404, "Fee config not found", { code: "NOT_FOUND" });
        }

        const nextType = data.type ?? existing.type;
        const nextAppliesTo = data.appliesTo ?? existing.appliesTo;
        const nextIsActive = data.isActive ?? existing.isActive;

        if (nextIsActive) {
            await ensureNoOverlap(nextType, nextAppliesTo, id);
        }

        const updated = await feeConfigRepository.updateConfig(id, {
            ...data,
            appliesTo: data.appliesTo ?? existing.appliesTo,
        });

        if (!updated) {
            throw new HttpError(500, "Failed to update fee config", { code: "INTERNAL_ERROR" });
        }

        return updated;
    }

    async deleteConfig(id: string) {
        const deleted = await feeConfigRepository.deleteConfig(id);
        if (!deleted) {
            throw new HttpError(404, "Fee config not found", { code: "NOT_FOUND" });
        }
        return true;
    }
}

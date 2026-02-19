import { CreateUtilityServiceDto, UpdateUtilityServiceDto } from "../../dtos/utility.dto";
import { HttpError } from "../../errors/http-error";
import { UtilityType } from "../../models/utility.model";
import { UtilityRepository } from "../../repositories/utility.repository";

let utilityRepository = new UtilityRepository();

interface ListUtilityServicesParams {
    type: UtilityType;
    page: number;
    limit: number;
    provider?: string;
    search?: string;
    isActive?: boolean;
}

export class AdminUtilityServiceService {
    async createService(type: UtilityType, data: CreateUtilityServiceDto) {
        return utilityRepository.createService(type, data);
    }

    async getService(type: UtilityType, id: string) {
        const service = await utilityRepository.getByIdAndType(id, type);
        if (!service) {
            throw new HttpError(404, "Service not found", { code: "NOT_FOUND" });
        }
        return service;
    }

    async listServices(params: ListUtilityServicesParams) {
        const { type, page, limit, provider, search, isActive } = params;
        const { items, total } = await utilityRepository.listByType({
            type,
            page,
            limit,
            provider,
            search,
            isActive,
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        return {
            items,
            total,
            page,
            limit,
            totalPages,
        };
    }

    async updateService(type: UtilityType, id: string, data: UpdateUtilityServiceDto) {
        const existing = await utilityRepository.getByIdAndType(id, type);
        if (!existing) {
            throw new HttpError(404, "Service not found", { code: "NOT_FOUND" });
        }

        const updated = await utilityRepository.updateService(id, type, data);
        if (!updated) {
            throw new HttpError(500, "Failed to update service");
        }
        return updated;
    }

    async deleteService(type: UtilityType, id: string) {
        const deleted = await utilityRepository.deleteService(id, type);
        if (!deleted) {
            throw new HttpError(404, "Service not found", { code: "NOT_FOUND" });
        }
        return true;
    }
}

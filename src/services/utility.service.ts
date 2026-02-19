import { HttpError } from "../errors/http-error";
import { UtilityType } from "../models/utility.model";
import { UtilityRepository } from "../repositories/utility.repository";

let utilityRepository = new UtilityRepository();

interface ListPublicUtilityParams {
    type: UtilityType;
    page: number;
    limit: number;
    provider?: string;
    search?: string;
}

export class UtilityService {
    async listPublicServices(params: ListPublicUtilityParams) {
        const { type, page, limit, provider, search } = params;
        const { items, total } = await utilityRepository.listByType({
            type,
            page,
            limit,
            provider,
            search,
            isActive: true,
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

    async getPublicServiceById(type: UtilityType, id: string) {
        const service = await utilityRepository.getByIdAndType(id, type);
        if (!service || !service.isActive) {
            throw new HttpError(404, "Service not found", { code: "NOT_FOUND" });
        }
        return service;
    }
}

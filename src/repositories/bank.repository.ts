import { BankModel, IBank } from "../models/bank.model";

export interface IBankRepository {
    createBank(data: Partial<IBank>): Promise<IBank>;
    getById(id: string): Promise<IBank | null>;
    getByNameOrCode(value: string): Promise<IBank | null>;
    listAll(): Promise<IBank[]>;
    listActive(): Promise<IBank[]>;
    updateBank(id: string, data: Partial<IBank>): Promise<IBank | null>;
    deleteBank(id: string): Promise<boolean>;
}

export class BankRepository implements IBankRepository {
    async createBank(data: Partial<IBank>): Promise<IBank> {
        const bank = new BankModel(data);
        return bank.save();
    }

    async getById(id: string): Promise<IBank | null> {
        return BankModel.findById(id);
    }

    async getByNameOrCode(value: string): Promise<IBank | null> {
        const normalized = value.trim();
        if (!normalized) return null;

        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return BankModel.findOne({
            isActive: true,
            $or: [{ code: normalized.toUpperCase() }, { name: new RegExp(`^${escaped}$`, "i") }],
        });
    }

    async listAll(): Promise<IBank[]> {
        return BankModel.find().sort({ createdAt: -1 });
    }

    async listActive(): Promise<IBank[]> {
        return BankModel.find({ isActive: true }).sort({ name: 1 });
    }

    async updateBank(id: string, data: Partial<IBank>): Promise<IBank | null> {
        return BankModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    }

    async deleteBank(id: string): Promise<boolean> {
        const result = await BankModel.findByIdAndDelete(id);
        return Boolean(result);
    }
}

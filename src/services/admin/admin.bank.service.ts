import { CreateBankDto, UpdateBankDto } from "../../dtos/bank.dto";
import { HttpError } from "../../errors/http-error";
import { BankRepository } from "../../repositories/bank.repository";

let bankRepository = new BankRepository();

const isDuplicateKeyError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    return (error as { code?: number }).code === 11000;
};

const ensureRegex = (pattern: string) => {
    try {
        new RegExp(pattern);
    } catch {
        throw new HttpError(400, "accountNumberRegex is invalid", {
            code: "VALIDATION_ERROR",
        });
    }
};

const ensureTransferRange = (minTransfer: number, maxTransfer: number) => {
    if (minTransfer >= maxTransfer) {
        throw new HttpError(400, "minTransfer must be less than maxTransfer", {
            code: "VALIDATION_ERROR",
        });
    }
};

export class AdminBankService {
    async createBank(data: CreateBankDto) {
        ensureRegex(data.accountNumberRegex);
        ensureTransferRange(data.minTransfer, data.maxTransfer);

        try {
            return await bankRepository.createBank({
                ...data,
                code: data.code.trim().toUpperCase(),
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new HttpError(409, "Bank code already exists", { code: "BANK_CODE_EXISTS" });
            }
            throw error;
        }
    }

    async listBanks() {
        return bankRepository.listAll();
    }

    async updateBank(bankId: string, data: UpdateBankDto) {
        const existing = await bankRepository.getById(bankId);
        if (!existing) {
            throw new HttpError(404, "Bank not found", { code: "NOT_FOUND" });
        }

        if (typeof data.accountNumberRegex === "string") {
            ensureRegex(data.accountNumberRegex);
        }

        const nextMinTransfer = data.minTransfer ?? existing.minTransfer;
        const nextMaxTransfer = data.maxTransfer ?? existing.maxTransfer;
        ensureTransferRange(nextMinTransfer, nextMaxTransfer);

        try {
            const updated = await bankRepository.updateBank(bankId, {
                ...data,
                ...(typeof data.code === "string" ? { code: data.code.trim().toUpperCase() } : {}),
            });

            if (!updated) {
                throw new HttpError(500, "Failed to update bank", {
                    code: "INTERNAL_ERROR",
                });
            }

            return updated;
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new HttpError(409, "Bank code already exists", { code: "BANK_CODE_EXISTS" });
            }
            throw error;
        }
    }

    async deleteBank(bankId: string) {
        const deleted = await bankRepository.deleteBank(bankId);
        if (!deleted) {
            throw new HttpError(404, "Bank not found", { code: "NOT_FOUND" });
        }

        return true;
    }
}

import { BANK_TRANSFER_FIXED_FEE } from "../configs";
import { BankRepository } from "../repositories/bank.repository";

let bankRepository = new BankRepository();

export class BankService {
    async listActiveBanks() {
        const banks = await bankRepository.listActive();

        return banks.map((bank) => ({
            _id: bank._id,
            name: bank.name,
            code: bank.code,
            minTransfer: bank.minTransfer,
            maxTransfer: bank.maxTransfer,
            fee: BANK_TRANSFER_FIXED_FEE,
        }));
    }
}

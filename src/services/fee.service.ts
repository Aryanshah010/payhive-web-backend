import { FeeConfigRepository } from "../repositories/fee-config.repository";
import type { FeeAppliesTo, FeeConfigType } from "../models/fee-config.model";

let feeConfigRepository = new FeeConfigRepository();

const normalizeAmount = (amount: number) => Math.round(amount * 100) / 100;

const resolveAppliesToOptions = (appliesTo: FeeAppliesTo) => {
    if (appliesTo === "topup" || appliesTo === "recharge") {
        return ["topup", "recharge"];
    }
    return [appliesTo];
};

export class FeeService {
    async getFixedFee(type: FeeConfigType, appliesTo: FeeAppliesTo): Promise<number> {
        const options = resolveAppliesToOptions(appliesTo);
        const config = await feeConfigRepository.findActiveByTypeAndAppliesTo(type, options);
        if (!config) {
            return 0;
        }
        if (config.calculation?.mode !== "fixed") {
            return 0;
        }

        return normalizeAmount(config.calculation.fixedAmount ?? 0);
    }
}

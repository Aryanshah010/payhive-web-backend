import { ClientSession } from "mongoose";
import { BankTransferModel, IBankTransfer } from "../models/bank-transfer.model";

export interface IBankTransferRepository {
    createTransfer(data: Partial<IBankTransfer>, session?: ClientSession): Promise<IBankTransfer>;
}

export class BankTransferRepository implements IBankTransferRepository {
    async createTransfer(data: Partial<IBankTransfer>, session?: ClientSession): Promise<IBankTransfer> {
        const transfer = new BankTransferModel(data);
        return transfer.save(session ? { session } : {});
    }
}

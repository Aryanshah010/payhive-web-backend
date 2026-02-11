import { UserModel } from "../../models/user.model";
import { TransactionModel } from "../../models/transaction.model";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const cleanupTestData = async (prefix: string) => {
    const regex = new RegExp(`^${escapeRegExp(prefix)}`);
    const users = await UserModel.find({ email: regex });
    const userIds = users.map((user) => user._id);

    if (userIds.length > 0) {
        await TransactionModel.deleteMany({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }],
        });
    }

    await UserModel.deleteMany({ email: regex });
};

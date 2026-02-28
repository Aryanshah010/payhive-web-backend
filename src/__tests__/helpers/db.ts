import { UserModel } from "../../models/user.model";
import { TransactionModel } from "../../models/transaction.model";
import { BookingModel } from "../../models/booking.model";
import { FlightModel } from "../../models/flight.model";
import { HotelModel } from "../../models/hotel.model";
import { UtilityModel } from "../../models/utility.model";
import { BankModel } from "../../models/bank.model";
import { BankTransferModel } from "../../models/bank-transfer.model";
import { FeeConfigModel } from "../../models/fee-config.model";
import { NotificationModel } from "../../models/notification.model";
import { MoneyRequestModel } from "../../models/money-request.model";
import { UndoRequestModel } from "../../models/undo-request.model";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const cleanupTestData = async (prefix: string) => {
    const regex = new RegExp(`^${escapeRegExp(prefix)}`);
    const users = await UserModel.find({ email: regex });
    const userIds = users.map((user) => user._id);
    const banks = await BankModel.find({
        $or: [{ name: regex }, { code: regex }],
    });
    const bankIds = banks.map((bank) => bank._id);

    if (userIds.length > 0) {
        await BookingModel.deleteMany({ userId: { $in: userIds } });
        await BankTransferModel.deleteMany({ userId: { $in: userIds } });
        await NotificationModel.deleteMany({ userId: { $in: userIds } });
        await MoneyRequestModel.deleteMany({
            $or: [{ requester: { $in: userIds } }, { receiver: { $in: userIds } }],
        });
        await UndoRequestModel.deleteMany({
            $or: [{ requester: { $in: userIds } }, { receiver: { $in: userIds } }],
        });
        await TransactionModel.deleteMany({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }],
        });
    }

    if (bankIds.length > 0) {
        await BankTransferModel.deleteMany({ bankId: { $in: bankIds } });
        await BankModel.deleteMany({ _id: { $in: bankIds } });
    }

    await FlightModel.deleteMany({
        $or: [
            { airline: regex },
            { flightNumber: regex },
            { from: regex },
            { to: regex },
        ],
    });
    await HotelModel.deleteMany({
        $or: [
            { name: regex },
            { city: regex },
            { roomType: regex },
        ],
    });
    await UtilityModel.deleteMany({
        $or: [
            { provider: regex },
            { name: regex },
            { packageLabel: regex },
        ],
    });

    await FeeConfigModel.deleteMany({ description: regex });

    await UserModel.deleteMany({ email: regex });
};

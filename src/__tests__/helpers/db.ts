import { UserModel } from "../../models/user.model";
import { TransactionModel } from "../../models/transaction.model";
import { BookingModel } from "../../models/booking.model";
import { FlightModel } from "../../models/flight.model";
import { HotelModel } from "../../models/hotel.model";
import { UtilityModel } from "../../models/utility.model";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const cleanupTestData = async (prefix: string) => {
    const regex = new RegExp(`^${escapeRegExp(prefix)}`);
    const users = await UserModel.find({ email: regex });
    const userIds = users.map((user) => user._id);

    if (userIds.length > 0) {
        await BookingModel.deleteMany({ userId: { $in: userIds } });
        await TransactionModel.deleteMany({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }],
        });
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

    await UserModel.deleteMany({ email: regex });
};

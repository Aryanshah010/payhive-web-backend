import { UserModel, IUser } from "../models/user.model";

export interface IUserRepository {
    createUser(userData: Partial<IUser>): Promise<IUser>;
    getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null>;
}

export class UserRepository implements IUserRepository {

    async getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null> {
        const user = await UserModel.findOne({ "phoneNumber": phoneNumber });
        return user;
    }

    async createUser(userData: Partial<IUser>): Promise<IUser> {
        const user = new UserModel(userData);
        await user.save();
        return user;
    }
}
import { UserModel, IUser } from "../models/user.model";

export interface IUserRepository {
    createUser(userData: Partial<IUser>): Promise<IUser>;
    getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null>;
    getUserById(userId: string): Promise<IUser | null>;
    updateProfilePicture(
        userId: string,
        newImageUrl: string
    ): Promise<IUser>;
}

export class UserRepository implements IUserRepository {

    async updateProfilePicture(
        userId: string,
        newImageUrl: string
    ): Promise<IUser> {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { imageUrl: newImageUrl },
            { new: true } 
        );

        if (!user) {
            throw new Error("User not found");
        }

        return user;
    }


    async getUserById(userId: string): Promise<IUser | null> {
        const user = await UserModel.findById(userId);
        return user;
    }

    async getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null> {
        const user = await UserModel.findOne({ "phoneNumber": phoneNumber });
        return user;
    }

    async createUser(userData: Partial<IUser>): Promise<IUser> {
        const user = new UserModel(userData);
        return await user.save();
    }
}
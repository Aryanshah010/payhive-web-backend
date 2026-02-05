import { UserModel, IUser } from "../models/user.model";

export interface IUserRepository {
    createUser(userData: Partial<IUser>): Promise<IUser>;
    getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null>;
    getUserById(userId: string): Promise<IUser | null>;
    updateProfilePicture(
        userId: string,
        newImageUrl: string
    ): Promise<IUser>;
    getAllUsers(): Promise<IUser[]>;
    updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null>;
    deleteUser(userId: string): Promise<boolean | null>;
}

interface PaginateArgs {
    skip: number;
    limit: number;
}

export class UserRepository implements IUserRepository {

    async getAllUsers(): Promise<IUser[]> {
        const users = await UserModel.find();
        return users;
    }

    async findPaginated(query: any, { skip, limit }: PaginateArgs) {

        const usersPromise = UserModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const countPromise = UserModel.countDocuments(query);
        const [users, total] = await Promise.all([usersPromise, countPromise]);

        return { users, total };
    }

    async updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );
        return updatedUser;
    }

    async deleteUser(userId: string): Promise<boolean | null> {
        const result = await UserModel.findByIdAndDelete(userId);
        return result ? true : false;
    }

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
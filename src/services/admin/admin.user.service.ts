import { UserRepository } from "../../repositories/user.repository";
import { CreateUserByAdminDto, UpdateUserDto } from "../../dtos/user.dto";
import bcryptjs from "bcryptjs";
import { HttpError } from "../../errors/http-error";
import path from "path";
import fs from "fs/promises";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

let userRepository = new UserRepository();

export class AdminUserService {
    async createUser(data: CreateUserByAdminDto & { imageUrl?: string }) {
        const { phoneNumber, password, ...rest } = data;

        const existing = await userRepository.getUserByPhoneNumber(phoneNumber);
        if (existing) {
            throw new HttpError(409, "Phone Number already in use");
        }

        const hashedPassword = await bcryptjs.hash(password, 10);

        const newUser = await userRepository.createUser({
            phoneNumber,
            password: hashedPassword,
            ...rest,
        });

        return newUser;
    }

    async getOneUser(userId: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");
        return user;
    }

    async getAllUsers() {
        return await userRepository.getAllUsers();
    }

    async deleteOneUser(userId: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");

        const result = await userRepository.deleteUser(userId);
        if (!result) throw new HttpError(500, "Failed to delete user");

        if (user.imageUrl) {
            const imagePath = path.join(UPLOADS_ROOT, path.basename(user.imageUrl));
            try {
                await fs.unlink(imagePath);
            } catch (err: any) {
                if (err.code !== "ENOENT") {
                    console.error("Failed to delete profile image:", err);
                }
            }
        }

        return true;
    }

    async updateOneUser(userId: string, updateData: UpdateUserDto & { imageUrl?: string }) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");

        if (updateData.phoneNumber && updateData.phoneNumber !== user.phoneNumber) {
            const existing = await userRepository.getUserByPhoneNumber(updateData.phoneNumber);
            if (existing) throw new HttpError(409, "Phone Number already in use");
        }

        if (updateData.password) {
            updateData.password = await bcryptjs.hash(updateData.password, 10);
        }

        const updatedUser = await userRepository.updateUser(userId, updateData);
        if (!updatedUser) throw new HttpError(500, "Failed to update user");

        if (updateData.imageUrl && user.imageUrl && updateData.imageUrl !== user.imageUrl) {
            const oldPath = path.join(UPLOADS_ROOT, path.basename(user.imageUrl));
            try {
                await fs.unlink(oldPath);
            } catch (err: any) {
                if (err.code !== "ENOENT") {
                    console.error("Failed to delete old profile picture:", err);
                }
            }
        }

        return updatedUser;
    }
}
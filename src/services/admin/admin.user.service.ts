import { UserRepository } from "../../repositories/user.repository";
import { CreateUserDto, UpdateUserDto } from "../../dtos/user.dto";
import bcryptjs from "bcryptjs";
import { HttpError } from "../../errors/http-error";
import path from "path";
import fs from "fs";

let userRepository = new UserRepository();

export class AdminUserService {

    async createUser(userData: CreateUserDto) {
        const checkPhoneNumber = await userRepository.getUserByPhoneNumber(userData.phoneNumber);
        if (checkPhoneNumber) {
            throw new HttpError(409, "Phone Number already in use");
        }
        const hashedPassword = await bcryptjs.hash(userData.password, 10);
        userData.password = hashedPassword;
        const newUser = await userRepository.createUser(userData);
        return newUser;
    }

    async getOneUser(userId: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) {
            throw new HttpError(404, "User not found.")
        }
        return user;
    }

    async getAllUsers() {
        return await userRepository.getAllUsers();

    }

    async deleteOneUser(userId: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) {
            throw new HttpError(404, "User not found.");
        }

        if (user.imageUrl) {
            const imagePath = path.join(__dirname, "../../", user.imageUrl);
            fs.unlink(imagePath, (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error("Failed to delete profile image:", err);
                }
            });
        }

        const result = await userRepository.deleteUser(userId);
        if (!result) {
            throw new HttpError(500, "Failed to delete user.")
        }
        return result;
    }

    async updateOneUser(userId: string, updateData: UpdateUserDto) {
        const user = await userRepository.getUserById(userId);
        if (!user) {
            throw new HttpError(404, "User not found.");
        }

        if (updateData.imageUrl && user.imageUrl) {
            const oldPath = path.join(__dirname, "../../", user.imageUrl);
            fs.unlink(oldPath, (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error("Failed to delete old profile picture:", err);
                }
            });
        }

        if (updateData.phoneNumber) {
            const existing = await userRepository.getUserByPhoneNumber(updateData.phoneNumber);
            if (existing && existing._id.toString() !== userId) {
                throw new HttpError(409, "Phone Number already in use");
            }
        }


        if (updateData.password) {
            updateData.password = await bcryptjs.hash(updateData.password, 10);
        }


        const updatedUser = await userRepository.updateUser(userId, updateData);
        if (!updatedUser) {
            throw new HttpError(500, "Failed to update user")
        }
        return updatedUser;
    }
}
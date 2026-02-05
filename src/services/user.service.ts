import { UserRepository } from "../repositories/user.repository";
import { CreateUserDto, LoginUserDto, UpdateDto, UpdateUserDto } from "../dtos/user.dto";
import bcryptjs from "bcryptjs";
import { HttpError } from "../errors/http-error";
import { JWT_SECRET } from "../configs";
import jwt from "jsonwebtoken";
import { IUser } from "../models/user.model";
import path from "path";
import fs from "fs";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

let userRepository = new UserRepository();

export class UserService {
    async registerUser(userData: CreateUserDto) {
        const checkPhoneNumber = await userRepository.getUserByPhoneNumber(userData.phoneNumber);
        if (checkPhoneNumber) {
            throw new HttpError(409, "Phone Number already in use");
        }
        const hashedPassword = await bcryptjs.hash(userData.password, 10);
        userData.password = hashedPassword;
        const newUser = await userRepository.createUser(userData);
        return newUser;
    }

    async loginUser(loginData: LoginUserDto) {
        const user = await userRepository.getUserByPhoneNumber(loginData.phoneNumber);
        if (!user) {
            throw new HttpError(404, "User not found!");
        }
        const validPassword = await bcryptjs.compare(loginData.password, user.password);
        if (!validPassword) {
            throw new HttpError(401, "Invalid credentials");
        }

        const payload = {
            id: user._id,
            phoneNumber: user.phoneNumber,
            role: user.role
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        return { token, user }
    }


    async updateProfilePicture(id: string, imageUrl: string): Promise<IUser> {
        const user = await userRepository.getUserById(id);
        if (!user) {
            throw new HttpError(404, "User not found");
        }

        // Delete old image if it exists
        if (user.imageUrl) {
            const oldPath = path.join(__dirname, "../../", user.imageUrl);
            fs.unlink(oldPath, (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error("Failed to delete old profile picture:", err);
                }
            });
        }

        const updatedUser = await userRepository.updateProfilePicture(
            id,
            imageUrl
        );

        return updatedUser;
    }

    async updateProfile( userId:string,updateData: UpdateDto & { imageUrl?: string }) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");

        if (updateData.password) {
            updateData.password = await bcryptjs.hash(updateData.password, 10);
        }

        const updatedUser = await userRepository.updateUser(userId, updateData);
        if (!updatedUser) throw new HttpError(500, "Failed to update user");

        if (updateData.imageUrl && user.imageUrl && updateData.imageUrl !== user.imageUrl) {
            const oldPath = path.join(UPLOADS_ROOT, path.basename(user.imageUrl));
            fs.unlink(oldPath, (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error("Failed to delete old profile picture:", err);
                }
            });
        }

        return updatedUser;
    }

    async getUserById(id: string): Promise<IUser> {
        const user = await userRepository.getUserById(id);
        if (!user) {
            throw new HttpError(404, "User not found");
        }
        return user;
    }

    async setOrUpdatePin(userId: string, pin: string, oldPin?: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");

        if (user.pinHash) {
            if (!oldPin) {
                throw new HttpError(400, "Old PIN is required");
            }
            const validOldPin = await bcryptjs.compare(oldPin, user.pinHash);
            if (!validOldPin) {
                throw new HttpError(401, "Invalid old PIN");
            }
        }

        const hashedPin = await bcryptjs.hash(pin, 10);
        const updatedUser = await userRepository.updatePin(userId, hashedPin);
        if (!updatedUser) throw new HttpError(500, "Failed to update PIN");

        return updatedUser;
    }


}

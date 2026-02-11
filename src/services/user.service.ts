import { UserRepository } from "../repositories/user.repository";
import { CreateUserDto, LoginUserDto, UpdateDto } from "../dtos/user.dto";
import bcryptjs from "bcryptjs";
import { HttpError } from "../errors/http-error";
import { CLIENT_URL, JWT_SECRET } from "../configs";
import jwt from "jsonwebtoken";
import { IUser } from "../models/user.model";
import path from "path";
import fs from "fs";
import { sendEmail } from "../configs/email";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

let userRepository = new UserRepository();

export class UserService {
    async registerUser(userData: CreateUserDto) {
        const checkPhoneNumber = await userRepository.getUserByPhoneNumber(userData.phoneNumber);
        if (checkPhoneNumber) {
            throw new HttpError(409, "Phone Number already in use");
        }
        userData.email = userData.email.trim().toLowerCase();
        const existingEmail = await userRepository.getUserByEmail(userData.email);
        if (existingEmail) {
            throw new HttpError(409, "Email already in use");
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

        if (updateData.email) {
            updateData.email = updateData.email.trim().toLowerCase();
        }

        if (updateData.email && updateData.email !== user.email) {
            const existingEmail = await userRepository.getUserByEmail(updateData.email);
            if (existingEmail && existingEmail._id.toString() !== userId) {
                throw new HttpError(409, "Email already in use");
            }
        }

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

    async verifyPin(userId: string, pin: string) {
        const user = await userRepository.getUserById(userId);
        if (!user) throw new HttpError(404, "User not found");

        if (!user.pinHash) {
            throw new HttpError(400, "PIN not set");
        }

        const validPin = await bcryptjs.compare(pin, user.pinHash);
        if (!validPin) {
            throw new HttpError(401, "Invalid PIN");
        }

        return true;
    }

    async sendResetPasswordEmail(email?: string) {
        if (!email) {
            throw new HttpError(400, "Email is required");
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await userRepository.getUserByEmail(normalizedEmail);
        if (!user || !user.email) {
            throw new HttpError(404, "User not found");
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });
        const resetLink = `${CLIENT_URL}/reset-password?token=${token}`;
        const html = `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`;

        await sendEmail(user.email, "Password Reset", html);
        return { token, user };
    }

    async resetPassword(token?: string, newPassword?: string) {
        if (!token || !newPassword) {
            throw new HttpError(400, "Token and new password are required");
        }

        let decoded: Record<string, any>;
        try {
            decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
        } catch (error) {
            throw new HttpError(400, "Invalid or expired token");
        }

        const userId = decoded?.id;
        if (!userId) {
            throw new HttpError(400, "Invalid or expired token");
        }

        const user = await userRepository.getUserById(userId);
        if (!user) {
            throw new HttpError(404, "User not found");
        }

        const hashedPassword = await bcryptjs.hash(newPassword, 10);
        await userRepository.updateUser(userId, { password: hashedPassword });
        return user;
    }

}

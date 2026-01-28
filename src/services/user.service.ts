import { UserRepository } from "../repositories/user.repository";
import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import bcryptjs from "bcryptjs";
import { HttpError } from "../errors/http-error";
import { JWT_SECRET } from "../configs";
import jwt from "jsonwebtoken";
import { IUser } from "../models/user.model";
import path from "path";
import fs from "fs";

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

    async getUserById(id: string): Promise<IUser> {
        const user = await userRepository.getUserById(id);
        if (!user) {
            throw new HttpError(404, "User not found");
        }
        return user;
    }


}
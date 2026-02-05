import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { HttpError } from "../errors/http-error";
import { UpdateDto } from "../dtos/user.dto";
import { UpdatePinDto } from "../dtos/pin.dto";
import z from "zod";


let userService = new UserService();

export class UserController {

    async updateProfilePicture(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res
                    .status(400)
                    .json({ success: false, message: "User ID not provided" });
            }

            if (!req.file) {
                throw new HttpError(400, "No profile picture uploaded");
            }

            const imageUrl = `/uploads/${req.file.filename}`;

            const updatedUser = await userService.updateProfilePicture(
                userId.toString(),
                imageUrl
            );

            return res.status(200).json({
                success: true,
                message: "Profile picture updated successfully",
                data: {
                    _id: updatedUser._id,
                    fullName: updatedUser.fullName,
                    imageUrl: updatedUser.imageUrl,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt,
                },
            });
        } catch (error: any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Failed to update profile picture",
            });
        }
    }

    async updateProfile(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res
                    .status(400)
                    .json({ success: false, message: "User ID not provided" });
            }

            const parsedData = UpdateDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                );
            }

            const updatePayload = {
                ...parsedData.data,
                ...(req.file && { imageUrl: `/uploads/${req.file.filename}` })
            };

            const updatedUser = await userService.updateProfile(userId.toString(), updatePayload);
            return res
                .status(200)
                .json({ success: true, data: updatedUser, message: "User updated successfully" });
        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({
                    success: false,
                    message: error.message || "Internal Server Error",
                });
        }
    }


    async getProfile(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res
                    .status(400)
                    .json({ success: false, message: "User ID not provided" });
            }

            const user = await userService.getUserById(userId.toString());
            if (!user) {
                return res
                    .status(404)
                    .json({ success: false, message: "User not found" });
            }

            return res.status(200).json({
                success: true,
                message: "User profile fetched successfully",
                data: {
                    _id: user._id,
                    fullName: user.fullName,
                    phoneNumber: user.phoneNumber,
                    imageUrl: user.imageUrl,
                    balance: user.balance,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
            });
        } catch (error: any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Failed to fetch user profile",
            });
        }
    }

    async updatePin(req: Request, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res
                    .status(400)
                    .json({ success: false, message: "User ID not provided" });
            }

            const parsedData = UpdatePinDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json({
                    success: false,
                    message: z.prettifyError(parsedData.error),
                });
            }

            await userService.setOrUpdatePin(
                userId.toString(),
                parsedData.data.pin,
                parsedData.data.oldPin
            );

            return res.status(200).json({
                success: true,
                message: "PIN updated successfully",
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Failed to update PIN",
            });
        }
    }

}

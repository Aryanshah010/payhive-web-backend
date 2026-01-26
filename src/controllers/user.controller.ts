import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { HttpError } from "../errors/http-error";


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
}
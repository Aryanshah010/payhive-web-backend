import { Request, Response } from "express";
import { AdminUserService } from "../../services/admin/admin.user.service";
import { CreateUserByAdminDto, UpdateUserDto } from "../../dtos/user.dto";
import z from "zod";

let adminUserService = new AdminUserService();

export class AdminUserController {
    async createUser(req: Request, res: Response) {
        try {
            const parsedData = CreateUserByAdminDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                );
            }
            let imageUrl: string | undefined;
            if (req.file) {
                imageUrl = `/uploads/${req.file.filename}`;
            }

            const dataToPass = { ...parsedData.data, imageUrl };

            const newUser = await adminUserService.createUser(dataToPass);
            return res.status(201).json(
                { success: true, message: "User registered successfully", data: newUser }
            );
        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Internal Server Error"
            });
        }
    }

    async getOneUser(req: Request, res: Response) {
        try {
            const userId = req.params.id;
            const user = await adminUserService.getOneUser(userId);
            return res
                .status(200)
                .json({ success: true, data: user, message: "User fetched" });
        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({
                    success: false,
                    message: error.message || "Internal Server Error",
                });
        }
    }

    async getAllUsers(req: Request, res: Response) {
        try {
            const users = await adminUserService.getAllUsers();
            return res
                .status(200)
                .json({ success: true, data: users, message: "All Users fetched successfully" });
        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({
                    success: false,
                    message: error.message || "Internal Server Error",
                });
        }
    }

    async updateOneUser(req: Request, res: Response) {
        try {
            const userId = req.params.id;
            const parsedData = UpdateUserDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                );
            }

            let updateData = parsedData.data;
            if (req.file) {
                updateData = { ...updateData, imageUrl: `/uploads/${req.file.filename}` };
            }

            const updatedUser = await adminUserService.updateOneUser(userId, updateData);
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

    async deleteOneUser(req: Request, res: Response) {
        try {
            const userId = req.params.id;
            const result = await adminUserService.deleteOneUser(userId);
            return res
                .status(200)
                .json({ success: true, message: "User deleted successfully", data: result });
        } catch (error: Error | any) {
            return res
                .status(error.statusCode || 500)
                .json({
                    success: false,
                    message: error.message || "Internal Server Error",
                });
        }
    }
}
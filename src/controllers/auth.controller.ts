import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import { UserSchema } from "../types/user.type";
import z from "zod";

let userService = new UserService();

const ResetPasswordRequestSchema = z.object({ email: z.email() });
const ResetPasswordSchema = z.object({ newPassword: UserSchema.shape.password });

export class AuthController {
    async createUser(req: Request, res: Response) {

        try {
            const parsedData = CreateUserDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }
                )
            }

            const newUser = await userService.registerUser(parsedData.data);

            return res.status(201).json(
                { success: true, message: "Registred Successfull", data: newUser }
            )

        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Internal Server Error" })
        }
    }

    async loginUser(req: Request, res: Response) {
        try {
            const parsedData = LoginUserDto.safeParse(req.body);
            if (!parsedData.success) {
                return res.status(400).json(
                    { success: false, message: z.prettifyError(parsedData.error) }

                )
            }
            const result = await userService.loginUser(parsedData.data, req.headers["user-agent"]);

            if (result.status !== "ALLOWED") {
                return res.status(403).json({
                    success: false,
                    message:
                        result.status === "BLOCKED"
                            ? "Device is blocked. Contact support."
                            : "New device detected. Approval required.",
                    deviceStatus: result.status,
                    deviceId: result.deviceId,
                    approvalRequired: result.approvalRequired || false,
                });
            }

            return res.status(200).json({
                success: true,
                message: "Login Successful",
                data: result.user,
                token: result.token,
                deviceId: result.deviceId,
            });

        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json(
                { success: false, message: error.message || "Internal Server Error" }
            )

        }
    }

    async sendResetPasswordEmail(req: Request, res: Response) {
        const parsedData = ResetPasswordRequestSchema.safeParse(req.body);
        if (!parsedData.success) {
            return res.status(400).json({
                success: false,
                message: z.prettifyError(parsedData.error),
            });
        }

        try {
            const { token, user } = await userService.sendResetPasswordEmail(parsedData.data.email);
            return res.status(200).json({
                success: true,
                data: user,
                token,
                message: "If the email is registered, a reset link has been sent.",
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode ?? 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

    async resetPassword(req: Request, res: Response) {
        const token = req.params.token;
        const parsedData = ResetPasswordSchema.safeParse(req.body);
        if (!parsedData.success) {
            return res.status(400).json({
                success: false,
                message: z.prettifyError(parsedData.error),
            });
        }

        try {
            await userService.resetPassword(token, parsedData.data.newPassword);
            return res.status(200).json({
                success: true,
                message: "Password has been reset successfully.",
            });
        } catch (error: Error | any) {
            return res.status(error.statusCode ?? 500).json({
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }

}

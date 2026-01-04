import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { CreateUserDto, LoginUserDto } from "../dtos/user.dto";
import z from "zod";

let userService = new UserService();

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
                { success: true, message: "Registred Successful", data: newUser }
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
            const { token, user } = await userService.loginUser(parsedData.data);
            return res.status(200).json(
                { success: true, message: "Login Successful", data: user, token }
            )

        } catch (error: Error | any) {
            return res.status(error.statusCode || 500).json(
                { success: false, message: error.message || "Internal Server Error" }
            )

        }
    }
}
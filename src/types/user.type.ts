import z from "zod";

export const UserSchema = z.object({
    fullName: z.string().min(3, "Full name must be atleat 3 letter long!"),
    phoneNumber: z.string()
        .regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)"),
    password: z.string()
        .min(6, "Password must be at least 6 characters long")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string()
}).refine(
    (data) => data.password === data.confirmPassword, {
    message: "password donot matched",
    path: ["confirmPassword"]
});

export type UserType=z.infer<typeof UserSchema>;
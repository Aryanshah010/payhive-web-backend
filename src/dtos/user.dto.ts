import z from 'zod';
import { UserSchema } from '../types/user.type';

export const CreateUserDto = UserSchema.pick(
    {
        fullName: true,
        phoneNumber: true,
        password: true,
    }
).extend( 
    {
        confirmPassword: z.string().min(6)
    }

).refine(
    (data) => data.password === data.confirmPassword,
    {
        message: "Passwords do not match",
        path: ["confirmPassword"] 
    }
);

export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const LoginUserDto = UserSchema.pick(
    {
        phoneNumber: true,
        password: true
    }
);

export type LoginUserDto = z.infer<typeof LoginUserDto>;
import z from 'zod';
import { UserSchema, UserUpdateSchema } from '../types/user.type';

export const CreateUserDto = UserSchema.pick(
    {
        fullName: true,
        phoneNumber: true,
        email: true,
        password: true,
    }
);

export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const LoginUserDto = z.object({
    phoneNumber: UserSchema.shape.phoneNumber,
    password: UserSchema.shape.password,
    deviceId: z.string().min(6).optional(),
    deviceName: z.string().max(100).optional(),
});

export type LoginUserDto = z.infer<typeof LoginUserDto>;

export const CreateUserByAdminDto = UserSchema.pick(
    {
        fullName: true,
        phoneNumber: true,
        email: true,
        password: true,
        role: true,
        imageUrl: true
    }
);

export type CreateUserByAdminDto = z.infer<typeof CreateUserByAdminDto>;

export const UpdateUserDto = UserSchema.partial();
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

export const UpdateDto = UserUpdateSchema.partial();
export type UpdateDto = z.infer<typeof UpdateDto>;

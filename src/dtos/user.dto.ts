import z from 'zod';
import { UserSchema, UserUpdateSchema } from '../types/user.type';

export const CreateUserDto = UserSchema.pick(
    {
        fullName: true,
        phoneNumber: true,
        password: true,
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

export const CreateUserByAdminDto = UserSchema.pick(
    {
        fullName: true,
        phoneNumber: true,
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
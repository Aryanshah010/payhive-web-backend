import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "../types/user.type";

const userMongoSchema: Schema = new Schema(
    {
        fullName: { type: String, required: false },
        phoneNumber: { type: String, required: true, unique: true },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true,
            sparse: true,
        },
        password: { type: String, required: true },
        pinHash: { type: String, required: false, default: null },
        pinAttempts: { type: Number, required: false, default: 0 },
        pinLockedUntil: { type: Date, required: false, default: null },
        balance: { type: Number, default: 0 },
        role: { type: String, enum: ["user", "admin"], default: "user" },
        imageUrl: { type: String, required: false },
    },
    {
        timestamps: true,
    }
)

export interface IUser extends UserType, Document {
    role: any;
    pinHash: string | null;
    pinAttempts: number;
    pinLockedUntil: Date | null;
    balance: number;
    email: string;
    _id: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export const UserModel = mongoose.model<IUser>("User", userMongoSchema);

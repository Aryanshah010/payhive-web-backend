import mongoose, { Document,Schema } from "mongoose";
import { UserType } from "../types/user.type";

const userMongoSchema: Schema =new Schema(
    {
        fullName: { type: String, required: false},
        phoneNumeber: { type: String, required: true, unique:true},
        password: { type: String, required: true},
        role: { type: String, enum: ["user","admin"], default: "user"},
    },
    {
        timestamps: true, 
    }
)

export interface IUser extends UserType, Document { 
    _id: mongoose.Types.ObjectId; 
    createdAt: Date;
    updatedAt: Date;
}

export const UserModel= mongoose.model<IUser>("User", userMongoSchema);
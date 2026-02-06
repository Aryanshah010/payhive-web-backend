import mongoose from "mongoose";
import { MONGODB_URI } from "../configs";

export const connectDb = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

    } catch (e) {
        console.error("MongoDB error: ", e);
        process.exit(1); 

    }
}

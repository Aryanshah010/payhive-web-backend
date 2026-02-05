import mongoose from "mongoose";
import { MONGODB_URI } from "../configs";

export const connectDb = async () => {
    try {
        // Note: MongoDB transactions require a replica set (single-node replica set works for dev).
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

    } catch (e) {
        console.error("MongoDB error: ", e);
        process.exit(1); 

    }
}

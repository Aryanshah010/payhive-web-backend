import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDb } from "../database/mongodb";
import { AdminImportService } from "../services/admin/admin.import.service";

dotenv.config();

const parseOverwriteArg = (args: string[]) => args.includes("--overwrite");

const run = async () => {
    const overwrite = parseOverwriteArg(process.argv.slice(2));
    const adminImportService = new AdminImportService();

    await connectDb();

    try {
        const result = await adminImportService.importFromSeedFiles({ overwrite });
        console.log("Seed import successful", JSON.stringify(result, null, 2));
    } finally {
        await mongoose.connection.close();
    }
};

run().catch((error: Error) => {
    console.error("Seed import failed:", error.message);
    process.exit(1);
});

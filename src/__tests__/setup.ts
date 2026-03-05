process.env.NODE_ENV = "test";
process.env.INTERNAL_NOTIFICATION_SECRET =
    process.env.INTERNAL_NOTIFICATION_SECRET || "itest-internal-secret";

import { connectDb } from "../database/mongodb";
import mongoose from "mongoose";

jest.setTimeout(20000);

// before all test starts
beforeAll(async () => {
    // can connect to test database or other test engines
    await connectDb();
});

// after all tests are done
afterAll(async () => {
    await mongoose.connection.close();
});

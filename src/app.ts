import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import bodyparser from 'body-parser'
import authRouters from "./routes/auth.route";
import cors from 'cors';
import path from 'path';
import adminUserRoutes from "./routes/admin/admin.user.route";
import userProfile from "./routes/user.route";
import transactionRoutes from "./routes/transaction.route";
import rateLimit from 'express-rate-limit';
import deviceRoutes from "./routes/device.route";

dotenv.config();
console.log(process.env.PORT);

const app: Application = express();

const isTestEnv = process.env.NODE_ENV === "test";

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

// Tighter rate limiter for transaction-related routes
const transactionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});

// let corsOptions = {
//     origin: ['http://localhost:3000', "http://localhost:3003"]
//     //List of accepted domain
// }
//origin: '*', //accept all
// app.use(cors(corsOptions));
if (!isTestEnv) {
    app.use(globalLimiter);
}
app.use(cors({
    origin: '*',
}));

app.use(bodyparser.json());
app.use("/api/auth", authRouters);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/profile', userProfile);
app.use('/api/devices', deviceRoutes);

if (isTestEnv) {
    app.use('/api/transactions', transactionRoutes);
} else {
    app.use('/api/transactions', transactionLimiter, transactionRoutes);
}

app.use("/uploads", express.static(path.join(__dirname, '../uploads')));


app.get("/", (req: Request, res: Response) => {
    res.send("Hello, World!")
});

export default app;

import dotenv from 'dotenv';
dotenv.config();

export const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 5050;
export const MONGODB_URI: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/default_db';
export const JWT_SECRET: string = process.env.JWT_SECRET || 'aryan@123_secret';

// Transfer limits
export const MAX_TRANSFER_AMOUNT: number = process.env.MAX_TRANSFER_AMOUNT
    ? parseInt(process.env.MAX_TRANSFER_AMOUNT)
    : 100000;

export const DAILY_TRANSFER_LIMIT: number = process.env.DAILY_TRANSFER_LIMIT
    ? parseInt(process.env.DAILY_TRANSFER_LIMIT)
    : 100000;

// PIN security
export const MAX_PIN_ATTEMPTS: number = process.env.MAX_PIN_ATTEMPTS
    ? parseInt(process.env.MAX_PIN_ATTEMPTS)
    : 3;

export const PIN_LOCKOUT_MINUTES: number = process.env.PIN_LOCKOUT_MINUTES
    ? parseInt(process.env.PIN_LOCKOUT_MINUTES)
    : 15;
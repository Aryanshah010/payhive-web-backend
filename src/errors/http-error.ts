export class HttpError extends Error {
    statusCode: number
    details?: Record<string, any>
    constructor(statusCode: number, message: string, details?: Record<string, any>) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}

import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp, ServiceAccount } from "firebase-admin/app";
import { Messaging, getMessaging } from "firebase-admin/messaging";
import { FCM_SERVICE_ACCOUNT_PATH } from "../configs";

interface FcmPayload {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

const CHUNK_SIZE = 500;

const normalizeDataPayload = (data?: Record<string, unknown>) => {
    const result: Record<string, string> = {};
    if (!data) {
        return result;
    }

    for (const [key, value] of Object.entries(data)) {
        if (value === null || typeof value === "undefined") {
            continue;
        }

        if (typeof value === "string") {
            result[key] = value;
            continue;
        }

        if (typeof value === "number" || typeof value === "boolean") {
            result[key] = String(value);
            continue;
        }

        try {
            result[key] = JSON.stringify(value);
        } catch {
            result[key] = String(value);
        }
    }

    return result;
};

const chunkTokens = (tokens: string[]) => {
    const chunks: string[][] = [];
    for (let index = 0; index < tokens.length; index += CHUNK_SIZE) {
        chunks.push(tokens.slice(index, index + CHUNK_SIZE));
    }
    return chunks;
};

export class FcmService {
    private skipLogged = false;

    private getMessagingClient(): Messaging | null {
        if (!FCM_SERVICE_ACCOUNT_PATH) {
            if (!this.skipLogged) {
                this.skipLogged = true;
                console.warn("FCM_SERVICE_ACCOUNT_PATH missing. Push notifications are disabled.");
            }
            return null;
        }

        const resolvedPath = path.resolve(FCM_SERVICE_ACCOUNT_PATH);
        if (!fs.existsSync(resolvedPath)) {
            if (!this.skipLogged) {
                this.skipLogged = true;
                console.warn(`FCM service account file not found at ${resolvedPath}. Push notifications are disabled.`);
            }
            return null;
        }

        if (getApps().length === 0) {
            const raw = fs.readFileSync(resolvedPath, "utf-8");
            const credentials = JSON.parse(raw) as Record<string, unknown>;
            initializeApp({
                credential: cert(credentials as ServiceAccount),
            });
        }

        return getMessaging();
    }

    async sendToTokens(tokens: string[], payload: FcmPayload): Promise<void> {
        const uniqueTokens = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
        if (uniqueTokens.length === 0) {
            return;
        }

        const messaging = this.getMessagingClient();
        if (!messaging) {
            return;
        }

        const dataPayload = normalizeDataPayload(payload.data);
        const tokenChunks = chunkTokens(uniqueTokens);

        for (const tokenChunk of tokenChunks) {
            try {
                await messaging.sendEachForMulticast({
                    tokens: tokenChunk,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                    data: dataPayload,
                });
            } catch (error) {
                console.error("FCM send failed:", error);
            }
        }
    }
}

import { DocumentDriveAction } from "document-model-libs/document-drive";
import { Operation, BaseAction, DocumentHeader, Document } from "document-model/document";
import { DocumentDriveStorage, DocumentStorage } from "../storage";
import { ICache } from "./types";
import Redis, { RedisClientType } from "redis";

class RedisCache implements ICache {

    private redis: RedisClientType;

    constructor(redis: RedisClientType) {
        this.redis = redis;
        this.redis.flushAll();
    }
    async setDocument(drive: string, id: string, document: any): Promise<void> {
        this.redis.hSet(drive, id, JSON.stringify(document));
    }
    async getDocument(drive: string, id: string): Promise<DocumentStorage<Document>> {
        const doc = await this.redis.hGet(drive, id);
        if (!doc) {
            throw new Error("Document not found");
        }

        return JSON.parse(doc) as DocumentStorage<Document>;
    }

    async deleteDocument(drive: string, id: string): Promise<void> {
        await this.redis.hDel(drive, id);
    }
}

export default RedisCache;
import { PrismaStorage, Transaction } from "./prisma";
import { RedisClientType } from "redis"
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from "./types";
import { DocumentHeader, Operation } from "document-model/document";


export class CloudStorage implements IDriveStorage {
    private db: PrismaStorage;
    private redis: RedisClientType;

    constructor(db: PrismaStorage, redis: RedisClientType) {
        this.db = db;
        this.redis = redis;
    }

    async processOperations() {
        if (!this.redis) {
            return process.nextTick(() => this.processOperations());
        }

        const entry = await this.redis.RPOP('operations');
        if (entry === null) {
            return process.nextTick(() => this.processOperations());
        }

        const { type, payload } = JSON.parse(entry);
        switch (type) {
            case 'CREATE_DOCUMENT': {
                const { drive, id, document } = payload;
                await this.db.createDocument(drive, id, document);
                break;
            }
            case 'ADD_DOCUMENT_OPERATIONS': {
                const { drive, id, operations, header, updatedOperations } = payload;
                await this.db.addDocumentOperations(drive, id, operations, header, updatedOperations);
                await this.removeDocumentFromCache(drive, id);
                break;
            }

            case 'DELETE_DOCUMENT': {
                const { drive, id } = payload;
                await this.db.deleteDocument(drive, id);
                await this.removeDocumentFromCache(drive, id);
                break;
            }
        }

        return process.nextTick(() => this.processOperations());

    }


    async storeDocumentInCache(driveId: string, documentId: string, value: any) {
        if (this.redis) {
            await this.redis.HSET(driveId, documentId, JSON.stringify(value));
        }
    }

    async retrieveDocumentFromCache(driveId: string, documentId: string) {
        if (this.redis) {
            const value = await this.redis.HGET(driveId, documentId)
            if (value) {
                return JSON.parse(value);
            }
        }
        return null;
    }

    async removeDocumentFromCache(driveId: string, documentId: string) {
        if (this.redis) {
            this.redis.HDEL(driveId, documentId);
        }
    }

    async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
        await this.createDocument('drives', id, drive as DocumentStorage);
    }


    async addDriveOperations(
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        await this.addDocumentOperations('drives', id, operations, header);
    }

    async createDocument(
        drive: string,
        id: string,
        document: DocumentStorage
    ): Promise<void> {
        await this.redis.LPUSH('operations', JSON.stringify({
            type: "CREATE_DOCUMENT",
            payload: { drive, id, document }
        }));
    }

    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []
    ): Promise<void> {
        await this.redis.LPUSH('operations', JSON.stringify({
            type: "ADD_DOCUMENT_OPERATIONS",
            payload: { drive, id, operations, header, updatedOperations }
        }));
    }

    async getDocuments(drive: string) {
        return this.db.getDocuments(drive);
    }

    async getDocument(driveId: string, id: string, tx?: Transaction) {
        const cachedDoc = await this.retrieveDocumentFromCache(driveId, id);
        if (cachedDoc) {
            return cachedDoc;
        }
        const doc = await this.db.getDocument(driveId, id, tx);
        await this.storeDocumentInCache(driveId, id, doc);
    }

    async deleteDocument(drive: string, id: string) {
        await this.redis.LPUSH('operations', JSON.stringify({
            type: "DELETE_DOCUMENT",
            payload: { drive, id }
        }));
    }

    async getDrives() {
        return this.db.getDocuments('drives');
    }

    async getDrive(id: string) {
        const cachedDoc = await this.retrieveDocumentFromCache("drives", id);
        if (cachedDoc) {
            return cachedDoc;
        }
        const doc = await this.db.getDrive(id);
        await this.storeDocumentInCache("drives", id, doc);
        return doc;
    }

    async deleteDrive(id: string) {
        await this.redis.LPUSH('operations', JSON.stringify({
            type: "DELETE_DRIVE",
            payload: { id }
        }));
    }
}
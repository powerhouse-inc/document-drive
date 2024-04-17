import { Operation, DocumentHeader, Document, BaseAction } from "document-model/document";
import { DocumentDriveStorage, DocumentStorage } from "../storage";
import { ICache } from "./types";
import { DocumentDriveAction } from "document-model-libs/document-drive";

class InMemoryCache implements ICache {

    private cache: Record<string, Record<string, DocumentStorage<Document>>>;

    constructor() {
        this.cache = {};
    }
    async setDocument(drive: string, id: string, document: any): Promise<void> {
        if (!this.cache[drive]) {
            this.cache[drive] = {};
        }
        this.cache[drive]![id] = document;
    }

    async deleteDocument(drive: string, id: string): Promise<void> {
        if (this.cache[drive]) {
            delete this.cache[drive]![id];
        }
    }

    async getDocument(drive: string, id: string): Promise<DocumentStorage<Document>> {
        const docList = this.cache[drive];
        if (!docList) {
            throw new Error("Document not found");
        }

        return docList[id] as DocumentStorage<Document>;
    }
}

export default InMemoryCache;
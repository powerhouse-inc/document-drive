import {
    DocumentDriveAction,
    DocumentDriveDocument
} from 'document-model-libs/document-drive';
import { Document, DocumentHeader, Operation } from 'document-model/document';
import { DocumentStorage, IDriveStorage } from './types';

export class MemoryStorage implements IDriveStorage {
    private documents: Record<string, Record<string, DocumentStorage>>;
    private drives: Record<string, DocumentDriveDocument>;

    constructor() {
        this.documents = {};
        this.drives = {};
    }

    async getDocuments(drive: string) {
        return Object.keys(this.documents[drive] ?? {});
    }

    async getDocument(driveId: string, id: string) {
        const drive = this.documents[driveId];
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }
        const document = drive[id];
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }
        return document;
    }

    async saveDocument(drive: string, id: string, document: Document) {
        this.documents[drive] = this.documents[drive] ?? {};
        this.documents[drive]![id] = document;
    }

    async createDocument(drive: string, id: string, document: DocumentStorage) {
        this.documents[drive] = this.documents[drive] ?? {};
        const {
            operations,
            initialState,
            name,
            revision,
            documentType,
            created,
            lastModified
        } = document;
        this.documents[drive]![id] = {
            operations,
            initialState,
            name,
            revision,
            documentType,
            created,
            lastModified
        };
    }

    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        if (!this.documents[drive]) {
            throw new Error(`Drive with id ${drive} not found`);
        }
        const document = this.documents[drive]![id];
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        const mergedOperations = operations.reduce((acc, curr) => {
            const operations = acc[curr.scope] ?? [];
            acc[curr.scope] = [...operations, curr];
            return acc;
        }, document.operations);

        this.documents[drive]![id] = {
            ...document,
            ...header,
            operations: mergedOperations
        };
    }

    async deleteDocument(drive: string, id: string) {
        if (!this.documents[drive]) {
            throw new Error(`Drive with id ${drive} not found`);
        }
        delete this.documents[drive]![id];
    }

    async getDrives() {
        return Object.keys(this.drives);
    }

    async getDrive(id: string) {
        const drive = this.drives[id];
        if (!drive) {
            throw new Error(`Drive with id ${id} not found`);
        }
        return drive;
    }

    async createDrive(drive: DocumentDriveDocument) {
        this.drives[drive.state.global.id] = drive;
    }

    async addDriveOperations(
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        const drive = await this.getDrive(id);
        const mergedOperations = operations.reduce((acc, curr) => {
            const operations = acc[curr.scope] ?? [];
            acc[curr.scope] = [
                ...operations,
                curr
            ] as Operation<DocumentDriveAction>[];
            return acc;
        }, drive.operations);

        this.drives[id] = {
            ...drive,
            ...header,
            operations: mergedOperations
        };
    }

    async deleteDrive(id: string) {
        delete this.documents[id];
        delete this.drives[id];
    }
}

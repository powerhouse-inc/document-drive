import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { IDriveStorage } from './types';

export class MemoryStorage implements IDriveStorage {
    private documents: Record<string, Record<string, Document>>;
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

    async saveDrive(drive: DocumentDriveDocument) {
        this.drives[drive.state.id] = drive;
    }

    async deleteDrive(id: string) {
        delete this.documents[id];
        delete this.drives[id];
    }
}

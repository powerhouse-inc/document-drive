import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { IDriveStorage } from './types';

export class BrowserStorage implements IDriveStorage {
    private db: Promise<LocalForage>;

    static DBName = 'DOCUMENT_DRIVES';
    static SEP = ':';
    static DRIVES_KEY = 'DRIVES';

    constructor() {
        this.db = import('localforage').then(localForage =>
            localForage.default.createInstance({
                name: BrowserStorage.DBName
            })
        );
    }

    buildKey(...args: string[]) {
        return args.join(BrowserStorage.SEP);
    }

    async getDocuments(drive: string) {
        const keys = await (await this.db).keys();
        const driveKey = `${drive}${BrowserStorage.SEP}`;
        return keys
            .filter(key => key.startsWith(driveKey))
            .map(key => key.slice(driveKey.length));
    }

    async getDocument(driveId: string, id: string) {
        const document = await (
            await this.db
        ).getItem<Document>(this.buildKey(driveId, id));
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }
        return document;
    }

    async saveDocument(drive: string, id: string, document: Document) {
        await (await this.db).setItem(this.buildKey(drive, id), document);
    }

    async deleteDocument(drive: string, id: string) {
        await (await this.db).removeItem(this.buildKey(drive, id));
    }

    async getDrives() {
        const drives =
            (await (
                await this.db
            ).getItem<DocumentDriveDocument[]>(BrowserStorage.DRIVES_KEY)) ??
            [];
        return drives.map(drive => drive.state.id);
    }

    async getDrive(id: string) {
        const drives =
            (await (
                await this.db
            ).getItem<DocumentDriveDocument[]>(BrowserStorage.DRIVES_KEY)) ??
            [];
        const drive = drives.find(drive => drive.state.id === id);
        if (!drive) {
            throw new Error(`Drive with id ${id} not found`);
        }
        return drive;
    }

    async saveDrive(drive: DocumentDriveDocument) {
        const db = await this.db;
        const drives =
            (await db.getItem<DocumentDriveDocument[]>(
                BrowserStorage.DRIVES_KEY
            )) ?? [];
        const index = drives.findIndex(d => d.state.id === drive.state.id);
        if (index > -1) {
            drives[index] = drive;
        } else {
            drives.push(drive);
        }
        await db.setItem(BrowserStorage.DRIVES_KEY, drives);
    }

    async deleteDrive(id: string) {
        const documents = await this.getDocuments(id);
        await Promise.all(documents.map(doc => this.deleteDocument(id, doc)));
        const db = await this.db;
        const drives =
            (await db.getItem<DocumentDriveDocument[]>(
                BrowserStorage.DRIVES_KEY
            )) ?? [];
        await db.setItem(
            BrowserStorage.DRIVES_KEY,
            drives.filter(drive => drive.state.id !== id)
        );
    }
}

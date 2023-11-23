import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import fs from 'fs/promises';

import path from 'path';
import sanitize from 'sanitize-filename';
import { IDriveStorage } from '../types';
import { isDocumentDrive } from '../utils';

export class FilesystemStorage implements IDriveStorage {
    private basePath: string;
    private static DRIVES_DIR = 'drives';

    constructor(basePath: string) {
        this.basePath = basePath;
    }

    private _buildPath(...args: string[]) {
        return `${path.join(
            this.basePath,
            ...args.map(arg => sanitize(arg))
        )}.json`;
    }

    async getDocuments(drive: string) {
        const files = await fs.readdir(this._buildPath(drive), {
            withFileTypes: true
        });
        const documents: string[] = [];
        for (const file of files.filter(file => file.isFile())) {
            try {
                // checks if file is document
                await this.getDocument(drive, file.name);
                documents.push(file.name);
            } catch {
                /* Ignore invalid document*/
            }
        }
        return documents;
    }

    async getDocument(drive: string, id: string) {
        const content = await fs.readFile(this._buildPath(drive, id));
        if (!content) {
            throw new Error(`Document with id ${id} not found`);
        }
        return JSON.parse(content.toString());
    }

    async saveDocument(drive: string, id: string, document: Document) {
        return fs.writeFile(
            this._buildPath(drive, id),
            JSON.stringify(document)
        );
    }

    async deleteDocument(drive: string, id: string) {
        fs.rm(this._buildPath(drive, id));
    }

    async getDrives() {
        const files = await fs.readdir(FilesystemStorage.DRIVES_DIR, {
            withFileTypes: true
        });
        const drives: string[] = [];
        for (const file of files.filter(file => file.isFile())) {
            try {
                // checks if file is drive
                await this.getDrive(file.name);
                drives.push(file.name);
            } catch {
                /* Ignore invalid drive document found on drives dir */
            }
        }
        return drives;
    }

    async getDrive(id: string) {
        let document: Document;
        try {
            document = await this.getDocument(id, '');
        } catch {
            throw new Error(`Drive with id ${id} not found`);
        }
        if (isDocumentDrive(document)) {
            return document;
        } else {
            throw new Error('Invalid drive document');
        }
    }

    saveDrive(drive: DocumentDriveDocument) {
        return this.saveDocument(
            FilesystemStorage.DRIVES_DIR,
            drive.state.id,
            drive
        );
    }

    deleteDrive(id: string) {
        return this.deleteDocument(FilesystemStorage.DRIVES_DIR, id);
    }
}

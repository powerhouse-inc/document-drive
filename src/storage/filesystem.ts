import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import type { Dirent } from 'fs';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync
} from 'fs';
import fs from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import { isDocumentDrive } from '../utils';
import { IDriveStorage } from './types';

type FSError = {
    errno: number;
    code: string;
    syscall: string;
    path: string;
};

function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

export class FilesystemStorage implements IDriveStorage {
    private basePath: string;
    private drivesPath: string;
    private static DRIVES_DIR = 'drives';

    constructor(basePath: string) {
        this.basePath = basePath;
        ensureDir(this.basePath);
        this.drivesPath = path.join(
            this.basePath,
            FilesystemStorage.DRIVES_DIR
        );
        ensureDir(this.drivesPath);
    }

    private _buildDocumentPath(...args: string[]) {
        return `${path.join(
            this.basePath,
            ...args.map(arg => sanitize(arg))
        )}.json`;
    }

    async getDocuments(drive: string) {
        let files: Dirent[] = [];
        try {
            files = readdirSync(path.join(this.basePath, drive), {
                withFileTypes: true
            });
        } catch (error) {
            // if folder is not found then drive has no documents
            if ((error as FSError).code !== 'ENOENT') {
                throw error;
            }
        }
        const documents: string[] = [];
        for (const file of files.filter(file => file.isFile())) {
            try {
                const documentId = path.parse(file.name).name;

                // checks if file is document
                await this.getDocument(drive, documentId);
                documents.push(documentId);
            } catch {
                /* Ignore invalid document*/
            }
        }
        return documents;
    }

    async getDocument(drive: string, id: string) {
        try {
            const content = readFileSync(this._buildDocumentPath(drive, id), {
                encoding: 'utf-8'
            });
            return JSON.parse(content);
        } catch (error) {
            console.error(error);
            throw new Error(`Document with id ${id} not found`);
        }
    }

    async saveDocument(drive: string, id: string, document: Document) {
        const documentPath = this._buildDocumentPath(drive, id);
        await ensureDir(path.dirname(documentPath));
        await writeFileSync(documentPath, JSON.stringify(document), {
            encoding: 'utf-8'
        });
    }

    async deleteDocument(drive: string, id: string) {
        return fs.rm(this._buildDocumentPath(drive, id));
    }

    async getDrives() {
        const files = await readdirSync(this.drivesPath, {
            withFileTypes: true
        });
        const drives: string[] = [];
        for (const file of files.filter(file => file.isFile())) {
            try {
                const driveId = path.parse(file.name).name;

                // checks if file is drive
                await this.getDrive(driveId);
                drives.push(driveId);
            } catch {
                /* Ignore invalid drive document found on drives dir */
            }
        }
        return drives;
    }

    async getDrive(id: string) {
        let document: Document;
        try {
            document = await this.getDocument(FilesystemStorage.DRIVES_DIR, id);
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
            drive.state.global.id,
            drive
        );
    }

    async deleteDrive(id: string) {
        const documents = await this.getDocuments(id);
        await this.deleteDocument(FilesystemStorage.DRIVES_DIR, id);
        await Promise.all(
            documents.map(document => this.deleteDocument(id, document))
        );
    }
}

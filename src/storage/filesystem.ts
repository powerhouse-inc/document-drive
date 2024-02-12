import { DocumentDriveAction } from 'document-model-libs/document-drive';
import { BaseAction, DocumentHeader, Operation } from 'document-model/document';
import type { Dirent } from 'fs';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync
} from 'fs';
import fs from 'fs/promises';
import stringify from 'json-stringify-deterministic';
import path from 'path';
import sanitize from 'sanitize-filename';
import { applyUpdatedOperations, mergeOperations } from '..';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

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
            throw new Error(`Document with id ${id} not found`);
        }
    }

    async createDocument(drive: string, id: string, document: DocumentStorage) {
        const documentPath = this._buildDocumentPath(drive, id);
        await ensureDir(path.dirname(documentPath));
        await writeFileSync(documentPath, stringify(document), {
            encoding: 'utf-8'
        });
    }

    async deleteDocument(drive: string, id: string) {
        return fs.rm(this._buildDocumentPath(drive, id));
    }

    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []
    ) {
        const document = await this.getDocument(drive, id);
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        const mergedOperations = mergeOperations(
            document.operations,
            operations
        );

        const mergedUpdatedOperations = applyUpdatedOperations(
            mergedOperations,
            updatedOperations
        );

        this.createDocument(drive, id, {
            ...document,
            ...header,
            operations: mergedUpdatedOperations
        });
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
        try {
            return (await this.getDocument(
                FilesystemStorage.DRIVES_DIR,
                id
            )) as DocumentDriveStorage;
        } catch {
            throw new Error(`Drive with id ${id} not found`);
        }
    }

    createDrive(id: string, drive: DocumentDriveStorage) {
        return this.createDocument(FilesystemStorage.DRIVES_DIR, id, drive);
    }

    async deleteDrive(id: string) {
        const documents = await this.getDocuments(id);
        await this.deleteDocument(FilesystemStorage.DRIVES_DIR, id);
        await Promise.all(
            documents.map(document => this.deleteDocument(id, document))
        );
    }

    async addDriveOperations(
        id: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        header: DocumentHeader
    ): Promise<void> {
        const drive = await this.getDrive(id);
        const mergedOperations = mergeOperations(drive.operations, operations);

        this.createDrive(id, {
            ...drive,
            ...header,
            operations: mergedOperations
        });
    }
}

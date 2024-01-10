import { PrismaClient } from '@prisma/client';
import {
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import {
    Document,
    DocumentHeader,
    ExtendedState,
    Operation,
    OperationScope
} from 'document-model/document';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class PrismaStorage implements IDriveStorage {
    private db: PrismaClient;

    constructor(db: PrismaClient) {
        this.db = db;
    }
    async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
        // drive for all drive documents
        await this.db.drive.upsert({
            where: {
                id: 'drives'
            },
            create: {
                id: 'drives'
            },
            update: {}
        });

        await this.createDocument(
            'drives',
            id,
            drive as DocumentStorage<Document>
        );

        await this.db.drive.upsert({
            where: {
                id: id
            },
            create: {
                id: id
            },
            update: {}
        });

        await this.db.drive;
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
        document: DocumentStorage<Document>
    ): Promise<void> {
        await this.db.document.upsert({
            where: {
                id_driveId: {
                    id,
                    driveId: drive
                }
            },
            update: {},
            create: {
                documentType: document.documentType,
                driveId: drive,
                initialState: document.initialState,
                lastModified: document.lastModified,
                name: document.name,
                revision: document.revision,
                id
            }
        });
    }
    async addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void> {
        const document = await this.getDocument(drive, id);
        if (!document) {
            throw new Error(`Document with id ${id} not found`);
        }

        try {
            await Promise.all(
                operations.map(async op => {
                    return this.db.operation.upsert({
                        where: {
                            driveId_documentId_scope_branch_index: {
                                driveId: drive,
                                documentId: id,
                                scope: op.scope,
                                branch: 'main',
                                index: op.index
                            }
                        },
                        create: {
                            driveId: drive,
                            documentId: id,
                            hash: op.hash,
                            index: op.index,
                            input: op.input,
                            timestamp: op.timestamp,
                            type: op.type,
                            scope: op.scope,
                            branch: 'main'
                        },
                        update: {
                            driveId: drive,
                            documentId: id,
                            hash: op.hash,
                            index: op.index,
                            input: op.input,
                            timestamp: op.timestamp,
                            type: op.type,
                            scope: op.scope,
                            branch: 'main'
                        }
                    });
                })
            );
        } catch (e) {
            console.log(e);
        }

        await this.db.document.upsert({
            where: {
                id_driveId: {
                    id: 'drives',
                    driveId: id
                }
            },
            create: {
                id: 'drives',
                driveId: id,
                documentType: header.documentType,
                initialState: document.initialState,
                lastModified: header.lastModified,
                name: header.name,
                revision: header.revision,
                created: header.created
            },
            update: {
                lastModified: header.lastModified,
                name: header.name,
                revision: header.revision
            }
        });
    }

    async getDocuments(drive: string) {
        const docs = await this.db.document.findMany({
            where: {
                AND: {
                    driveId: drive,
                    NOT: {
                        id: 'drives'
                    }
                }
            }
        });

        return docs.map(doc => doc.id);
    }

    async getDocument(driveId: string, id: string) {
        const result = await this.db.document.findFirst({
            where: {
                id: id,
                driveId: driveId
            },
            include: {
                Drive: {
                    include: {
                        driveMetaDocument: true
                    }
                },
                operations: {
                    include: {
                        attachments: true
                    }
                }
            }
        });

        if (result === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        const dbDoc = result;

        const doc = {
            created: dbDoc.created.toISOString(),
            documentType: dbDoc.documentType,
            initialState: dbDoc.initialState as ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >,
            lastModified: dbDoc.lastModified.toISOString(),
            name: dbDoc.name,
            operations: {
                global: dbDoc.operations
                    .filter(op => op.scope === 'global')
                    .map(op => ({
                        hash: op.hash,
                        index: op.index,
                        timestamp: new Date(op.timestamp).toISOString(),
                        input: op.input,
                        type: op.type,
                        scope: op.scope as OperationScope
                        // attachments: fileRegistry
                    })),
                local: dbDoc.operations
                    .filter(op => op.scope === 'local')
                    .map(op => ({
                        hash: op.hash,
                        index: op.index,
                        timestamp: new Date(op.timestamp).toISOString(),
                        input: op.input,
                        type: op.type,
                        scope: op.scope as OperationScope
                        // attachments: fileRegistry
                    }))
            },
            revision: dbDoc.revision
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        await this.db.document.delete({
            where: {
                id_driveId: {
                    driveId: drive,
                    id: id
                }
            }
        });
    }

    async getDrives() {
        const results = await this.db.drive.findMany({
            where: {
                NOT: {
                    id: 'drives'
                }
            }
        });
        return results.map(drive => drive.id);
    }

    async getDrive(id: string) {
        try {
            const doc = await this.getDocument('drives', id);
            return doc as DocumentDriveStorage;
        } catch (e) {
            throw new Error(`Drive with id ${id} not found`);
        }
    }

    async deleteDrive(id: string) {
        await this.db.document.deleteMany({
            where: {
                driveId: id
            }
        });
        await this.db.drive.deleteMany({
            where: {
                id
            }
        });
    }
}
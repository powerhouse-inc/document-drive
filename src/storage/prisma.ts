import { PrismaClient, type Prisma } from '@prisma/client';
import {
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import type {
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
        await this.db.document.upsert({
            where: {
                id_driveId: {
                    id,
                    driveId: drive
                }
            },
            update: {},
            create: {
                name: document.name,
                documentType: document.documentType,
                driveId: drive,
                initialState: document.initialState as Prisma.InputJsonObject,
                lastModified: document.lastModified,
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
                    return this.db.operation.createMany({
                        data: {
                            driveId: drive,
                            documentId: id,
                            hash: op.hash,
                            index: op.index,
                            input: op.input as Prisma.InputJsonObject,
                            timestamp: op.timestamp,
                            type: op.type,
                            scope: op.scope,
                            branch: 'main',
                            skip: op.skip
                        },
                    });
                })
            );

            await this.db.document.updateMany({
                where: {
                    id,
                    driveId: drive
                },
                data: {
                    lastModified: header.lastModified,
                    revision: header.revision
                }
            });
        } catch (e) {
            console.log(e);
        }
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
                operations: {
                    orderBy: {
                        index: 'asc'
                    },
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
            name: dbDoc.name ? dbDoc.name : '',
            documentType: dbDoc.documentType,
            initialState: dbDoc.initialState as ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >,
            lastModified: new Date(dbDoc.lastModified).toISOString(),
            operations: {
                global: dbDoc.operations
                    .filter(op => op.scope === 'global' && !op.clipboard)
                    .map(op => ({
                        skip: op.skip,
                        hash: op.hash,
                        index: op.index,
                        timestamp: new Date(op.timestamp).toISOString(),
                        input: op.input,
                        type: op.type,
                        scope: op.scope as OperationScope
                        // attachments: fileRegistry
                    })),
                local: dbDoc.operations
                    .filter(op => op.scope === 'local' && !op.clipboard)
                    .map(op => ({
                        skip: op.skip,
                        hash: op.hash,
                        index: op.index,
                        timestamp: new Date(op.timestamp).toISOString(),
                        input: op.input,
                        type: op.type,
                        scope: op.scope as OperationScope
                        // attachments: fileRegistry
                    }))
            },
            clipboard: dbDoc.operations
                .filter(op => op.clipboard)
                .map(op => ({
                    skip: op.skip,
                    hash: op.hash,
                    index: op.index,
                    timestamp: new Date(op.timestamp).toISOString(),
                    input: op.input,
                    type: op.type,
                    scope: op.scope as OperationScope
                    // attachments: fileRegistry
                })),
            revision: dbDoc.revision as Record<OperationScope, number>
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
            },
            include: {
                operations: {
                    include: {
                        attachments: true
                    }
                }
            }
        });

    }

    async getDrives() {
        return this.getDocuments('drives');
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
        const docs = await this.getDocuments(id);
        console.log(docs);
        await Promise.all(docs.map(async doc => {
            return this.deleteDocument(id, doc)
        }));
        await this.deleteDocument('drives', id);
    }
}

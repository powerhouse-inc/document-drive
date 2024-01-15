import { type Prisma } from '@prisma/client';
import {
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import {
    DocumentHeader,
    ExtendedState,
    Operation,
    OperationScope
} from 'document-model/document';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class PrismaStorage implements IDriveStorage {
    private db: Prisma.TransactionClient;

    constructor(db: Prisma.TransactionClient) {
        this.db = db;
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
                            input: op.input as Prisma.InputJsonObject,
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
                            input: op.input as Prisma.InputJsonObject,
                            timestamp: op.timestamp,
                            type: op.type,
                            scope: op.scope,
                            branch: 'main'
                        }
                    });
                })
            );

            await this.db.document.update({
                where: {
                    id_driveId: {
                        id,
                        driveId: 'drives'
                    }
                },
                data: {
                    lastModified: header.lastModified,
                    revision: header.revision
                }
            });
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
                revision: header.revision,
                created: header.created
            },
            update: {
                lastModified: header.lastModified,
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
            name: dbDoc.name ? dbDoc.name : '',
            documentType: dbDoc.documentType,
            initialState: dbDoc.initialState as ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >,
            lastModified: dbDoc.lastModified.toISOString(),
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
            revision: dbDoc.revision as Required<Record<OperationScope, number>>
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        await this.db.document.deleteMany({
            where: {
                driveId: drive,
                id: id
            }
        });
    }

    async getDrives() {
        return this.getDocuments('drives');
    }

    async getDrive(id: string) {
        return this.getDocument('drives', id) as Promise<DocumentDriveStorage>;
    }

    async deleteDrive(id: string) {
        await this.deleteDocument('drives', id);
        await this.db.document.deleteMany({
            where: {
                driveId: id
            }
        });
    }
}

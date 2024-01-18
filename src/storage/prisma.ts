import { PrismaClient, type Prisma } from '@prisma/client';
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
import {
    CreateListenerInput,
    Listener,
    ListenerCallInfo,
    ListenerFilter
} from '..';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class PrismaStorage implements IDriveStorage {
    private db: PrismaClient;

    constructor(db: PrismaClient) {
        this.db = db;
    }
    async addListener(input: CreateListenerInput): Promise<Listener> {
        const result = await this.db.listener.create({
            data: {
                ...input,
                callInfo: input.callInfo ? input.callInfo : {}
            }
        });

        const listener: Listener = {
            ...result,
            label: result.label ? result.label : '',
            filter: result.filter as ListenerFilter,
            callInfo: result.callInfo
                ? (result.callInfo as ListenerCallInfo)
                : undefined
        };

        return listener;
    }

    async deleteListener(listenerId: string): Promise<boolean> {
        const result = await this.db.listener.delete({
            where: {
                listenerId
            }
        });

        return result !== null;
    }

    async getListeners(): Promise<Listener[]> {
        const result = await this.db.listener.findMany({});
        return result.map(e => ({
            ...e,
            label: e.label ? e.label : '',
            filter: e.filter as ListenerFilter,
            callInfo: e.callInfo ? (e.callInfo as ListenerCallInfo) : undefined
        }));
    }

    async createDrive(id: string, drive: DocumentDriveStorage): Promise<void> {
        // drive for all drive documents
        await this.createDocument(
            'drives',
            id,
            drive as DocumentStorage<Document>
        );
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
            revision: dbDoc.revision
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        await this.db.attachment.deleteMany({
            where: {
                driveId: drive,
                documentId: id
            }
        });

        await this.db.operation.deleteMany({
            where: {
                driveId: drive,
                documentId: id
            }
        });

        await this.db.document.delete({
            where: {
                id_driveId: {
                    driveId: drive,
                    id: id
                }
            }
        });

        if (drive === 'drives') {
            await this.db.attachment.deleteMany({
                where: {
                    driveId: id
                }
            });

            await this.db.operation.deleteMany({
                where: {
                    driveId: id
                }
            });

            await this.db.document.deleteMany({
                where: {
                    driveId: id
                }
            });
        }
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
        await this.deleteDocument('drives', id);
    }
}

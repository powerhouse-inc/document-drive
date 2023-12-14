import { PrismaClient } from '@prisma/client';
import {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import {
    Document,
    ExtendedState,
    FileRegistry,
    Operation,
    OperationScope
} from 'document-model/document';
import { IDriveStorage } from './types';

export class PrismaStorage implements IDriveStorage {
    private db: PrismaClient;

    constructor() {
        this.db = new PrismaClient();
    }

    async getDocuments(drive: string) {
        const docs = await this.db.node.findMany({
            where: {
                AND: {
                    driveId: drive,
                    NOT: {
                        id: {
                            contains: 'drive-'
                        }
                    }
                }
            },
            include: {
                Document: true
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
                operations: true,
                Node: true
            }
        });

        if (result === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        const dbDoc = result;

        const doc: DocumentDriveDocument = {
            attachments: dbDoc.attachements as FileRegistry,
            created: dbDoc.created.toISOString(),
            documentType: dbDoc.documentType,
            initialState:
                dbDoc.initialState as ExtendedState<DocumentDriveState>,
            lastModified: dbDoc.lastModified.toISOString(),
            name: dbDoc.name,
            operations: dbDoc.operations.map(op => {
                return {
                    hash: op.hash,
                    index: op.index,
                    timestamp: op.timestamp.toISOString(),
                    input: JSON.parse(op.input),
                    type: op.type,
                    scope: op.scope as OperationScope,
                    attachments: op.attachements
                        ? JSON.parse(op.attachements)
                        : {}
                };
            }) as Operation<DocumentDriveAction>[],
            revision: dbDoc.revision,
            state: dbDoc.state as ExtendedState<DocumentDriveState>
        };

        return doc;
    }

    async saveDocument(drive: string, id: string, document: Document) {
        try {
            await this.db.document.upsert({
                where: {
                    id_driveId: {
                        driveId: drive,
                        id: id
                    }
                },
                create: {
                    documentType: document.documentType,
                    initialState:
                        document.initialState as ExtendedState<DocumentDriveState>,
                    lastModified: document.lastModified,
                    name: document.name,
                    revision: document.revision,
                    state: document.state as ExtendedState<DocumentDriveState>,
                    id: id,
                    driveId: drive,
                    attachements: document.attachments,
                    created: document.created
                },
                update: {
                    documentType: document.documentType,
                    initialState:
                        document.initialState as ExtendedState<DocumentDriveState>,
                    lastModified: document.lastModified,
                    name: document.name,
                    revision: document.revision,
                    state: document.state as ExtendedState<DocumentDriveState>,
                    attachements: document.attachments,
                    created: document.created
                }
            });

            // add operations
            await Promise.all(
                document.operations.map(op => {
                    return this.db.operation.upsert({
                        where: {
                            documentId_timestamp_hash: {
                                hash: op.hash,
                                timestamp: op.timestamp,
                                documentId: id
                            }
                        },
                        create: {
                            driveId: drive,
                            documentId: id,
                            hash: op.hash,
                            index: op.index,
                            input: JSON.stringify(op.input),
                            timestamp: op.timestamp,
                            type: op.type
                        },
                        update: {
                            index: op.index,
                            hash: op.hash,
                            input: JSON.stringify(op.input),
                            timestamp: op.timestamp,
                            type: op.type
                        }
                    });
                })
            );
        } catch (e) {
            console.log(e);
        }
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
        const results = await this.db.drive.findMany();
        return results.map(drive => drive.id);
    }

    async getDrive(id: string) {
        const drive = await this.db.drive.findFirst({
            where: {
                id: id
            },
            include: {
                driveMetaDocument: {
                    include: {
                        operations: true
                    }
                },
                nodes: {
                    include: {
                        Document: true
                    }
                }
            }
        });

        if (!drive || !drive.driveMetaDocument) {
            throw new Error(`Drive with id ${id} not found`);
        }

        const metaDoc = drive.driveMetaDocument;

        const driveDoc: DocumentDriveDocument = {
            attachments: metaDoc.attachements as FileRegistry,
            created: metaDoc.created.toISOString(),
            documentType: metaDoc.documentType,
            initialState:
                metaDoc.initialState as ExtendedState<DocumentDriveState>,
            lastModified: metaDoc.lastModified.toISOString(),
            name: metaDoc.name,
            revision: metaDoc.revision,
            state: {
                icon: drive.icon,
                id: drive.id,
                name: drive.name ?? '',
                remoteUrl: drive.remoteUrl ?? null,
                nodes:
                    drive.nodes.map(node => {
                        return {
                            documentType: node.Document[0]
                                ? node.Document[0].documentType
                                : '',
                            id: node.id,
                            kind: node.kind ?? '',
                            name: node.name ?? '',
                            parentFolder: node.parentFolder ?? ''
                        };
                    }) ?? []
            },
            operations: metaDoc.operations.map(op => {
                return {
                    hash: op.hash,
                    index: op.index,
                    timestamp: op.timestamp.toISOString(),
                    input: JSON.parse(op.input),
                    type: op.type
                };
            }) as Operation<DocumentDriveAction>[]
        };

        return driveDoc;
    }

    async saveDrive(drive: DocumentDriveDocument) {
        await this.saveDocument(
            drive.state.id,
            'drive-' + drive.state.id,
            drive
        );

        await this.db.drive.upsert({
            where: {
                id: drive.state.id
            },
            create: {
                driveDocumentId: 'drive-' + drive.state.id,
                icon: drive.state.icon,
                name: drive.state.name,
                remoteUrl: drive.state.remoteUrl,
                id: drive.state.id
            },
            update: {
                icon: drive.state.icon,
                name: drive.state.name,
                remoteUrl: drive.state.remoteUrl
            }
        });

        // persist nodes
        await Promise.all(
            drive.state.nodes.map(e => {
                return this.db.node.upsert({
                    where: {
                        driveId_id: {
                            id: e.id,
                            driveId: drive.state.id
                        }
                    },
                    create: {
                        id: e.id,
                        driveId: drive.state.id,
                        kind: e.kind,
                        name: e.name,
                        parentFolder: e.parentFolder
                    },
                    update: {
                        kind: e.kind,
                        name: e.name,
                        parentFolder: e.parentFolder
                    }
                });
            })
        );

        // delete nodes, which arent in the drive anymore
        await this.db.node.deleteMany({
            where: {
                AND: {
                    driveId: drive.state.id,
                    NOT: {
                        id: {
                            in: drive.state.nodes.map(node => node.id)
                        }
                    }
                }
            }
        });
    }

    async deleteDrive(id: string) {
        await Promise.all([
            this.db.drive.deleteMany({
                where: {
                    id
                }
            })
        ]);
    }
}

import { PrismaClient } from '@prisma/client';
import {
    DocumentDriveAction,
    DocumentDriveDocument
} from 'document-model-libs/document-drive';
import {
    Document,
    FileRegistry,
    Operation,
    OperationScope
} from 'document-model/document';
import { IDriveStorage } from './types';

export class PrismaStorage implements IDriveStorage {
    private db: PrismaClient;

    static DBName = 'DOCUMENT_DRIVES';
    static SEP = ':';
    static DRIVES_KEY = 'DRIVES';

    constructor() {
        this.db = new PrismaClient();
    }

    buildKey(...args: string[]) {
        return args.join(PrismaStorage.SEP);
    }

    async getDocuments(drive: string) {
        const docs = await this.db.driveDocument.findMany({
            where: {
                driveId: drive
            },
            include: {
                Document: true
            }
        });

        return docs.map(doc => doc.identifier);
    }

    async getDocument(driveId: string, id: string) {
        const result = await this.db.driveDocument.findFirst({
            where: {
                documentId: id,
                driveId: driveId
            },
            include: {
                Document: {
                    include: {
                        operations: {
                            include: {
                                attachements: true
                            }
                        }
                    }
                },
                Drive: {
                    include: {
                        driveMetaDocument: true
                    }
                }
            }
        });

        const fileRegistry: FileRegistry = {};

        if (result === null || result.Document === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        const dbDoc = result.Document;

        const doc: DocumentDriveDocument = {
            attachments: fileRegistry,
            created: dbDoc.created.toISOString(),
            documentType: dbDoc.documentType,
            initialState: JSON.parse(dbDoc.initialState),
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
                    attachments: op.attachements.map(a => {
                        return {
                            hash: a.hash,
                            data: a.data,
                            mimeType: a.mimeType,
                            extension: a.extension,
                            fileName: a.fileName
                        };
                    })
                };
            }) as Operation<DocumentDriveAction>[],
            revision: dbDoc.revision,
            state: JSON.parse(dbDoc.state)
        };

        return doc;
    }

    async saveDocument(drive: string, id: string, document: Document) {
        const doc = await this.db.driveDocument.findFirst({
            where: {
                driveId: drive,
                identifier: id
            }
        });

        if (!doc) {
            const dbDoc = await this.db.document.create({
                data: {
                    id,
                    documentType: document.documentType,
                    initialState: JSON.stringify(document.initialState),
                    lastModified: new Date(document.lastModified),
                    name: document.name,
                    revision: document.revision,
                    state: JSON.stringify(document.state),
                    attachements: document.attachments,
                    operations: {
                        create: document.operations.map(op => {
                            return {
                                hash: op.hash,
                                index: op.index,
                                timestamp: new Date(op.timestamp),
                                input: JSON.stringify(op.input),
                                type: op.type
                            };
                        })
                    }
                }
            });

            await this.db.driveDocument.create({
                data: {
                    documentId: dbDoc.id,
                    identifier: id,
                    driveId: drive
                }
            });
        } else {
            await this.db.document.update({
                where: {
                    id: doc.id
                },
                data: {
                    documentType: document.documentType,
                    initialState: JSON.stringify(document.initialState),
                    lastModified: new Date(document.lastModified),
                    name: document.name,
                    revision: document.revision,
                    state: JSON.stringify(document.state),
                    attachements: document.attachments,
                    operations: {
                        create: document.operations.map(op => {
                            return {
                                hash: op.hash,
                                index: op.index,
                                timestamp: new Date(op.timestamp),
                                input: JSON.stringify(op.input),
                                type: op.type
                            };
                        })
                    }
                }
            });
        }
    }

    async deleteDocument(drive: string, id: string) {
        console.log('delete document', drive, id);
        const driveDoc = await this.db.driveDocument.findFirst({
            where: {
                driveId: drive,
                identifier: id
            }
        });

        if (!driveDoc) {
            return;
        }

        await this.db.driveDocument.delete({
            where: {
                id: driveDoc?.id
            },
            include: {
                Document: true
            }
        });

        await this.db.document.delete({
            where: {
                id: driveDoc?.documentId
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
                        operations: {
                            include: {
                                attachements: true
                            }
                        }
                    }
                },
                DriveDocument: {
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
            attachments: {},
            created: metaDoc.created.toISOString(),
            documentType: metaDoc.documentType,
            initialState: JSON.parse(metaDoc.initialState),
            lastModified: metaDoc.lastModified.toISOString(),
            name: metaDoc.name,
            revision: metaDoc.revision,
            operations: metaDoc.operations.map(op => {
                return {
                    hash: op.hash,
                    index: op.index,
                    timestamp: op.timestamp.toISOString(),
                    input: JSON.parse(op.input),
                    type: op.type,
                    scope: op.scope as OperationScope,
                    attachments: op.attachements.map(a => {
                        return {
                            hash: a.hash,
                            data: a.data,
                            mimeType: a.mimeType,
                            extension: a.extension,
                            fileName: a.fileName
                        };
                    })
                };
            }) as Operation<DocumentDriveAction>[],
            state: JSON.parse(metaDoc.state)
        };

        return driveDoc;
    }

    async saveDrive(drive: DocumentDriveDocument) {
        await this.db.drive.upsert({
            where: {
                id: drive.state.id
            },
            create: {
                createdAt: new Date(),
                id: drive.state.id,
                driveMetaDocument: {
                    create: {
                        documentType: drive.documentType,
                        initialState: JSON.stringify(drive.initialState),
                        lastModified: new Date(),
                        name: drive.name,
                        revision: drive.revision,
                        state: JSON.stringify(drive.state),
                        attachements: drive.attachments,
                        operations: {
                            create: drive.operations.map(op => {
                                return {
                                    hash: op.hash,
                                    index: op.index,
                                    timestamp: new Date(op.timestamp),
                                    input: JSON.stringify(op.input),
                                    type: op.type
                                };
                            })
                        }
                    }
                }
            },
            update: {
                id: drive.state.id,
                driveMetaDocument: {
                    create: {
                        documentType: drive.documentType,
                        initialState: JSON.stringify(drive.initialState),
                        lastModified: new Date(),
                        name: drive.name,
                        revision: drive.revision,
                        state: JSON.stringify(drive.state),
                        attachements: drive.attachments,
                        operations: {
                            create: drive.operations.map(op => {
                                return {
                                    hash: op.hash,
                                    index: op.index,
                                    timestamp: new Date(op.timestamp),
                                    input: JSON.stringify(op.input),
                                    type: op.type
                                };
                            })
                        }
                    }
                }
            }
        });
    }

    async deleteDrive(id: string) {
        await this.db.drive.delete({
            where: {
                id: id
            }
        });
    }
}

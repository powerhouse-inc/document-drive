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
import { DataTypes, Options, Sequelize } from 'sequelize';
import { DocumentDriveStorage, DocumentStorage, IDriveStorage } from './types';

export class SequelizeStorage implements IDriveStorage {
    private db: Sequelize;

    constructor(options: Options) {
        this.db = new Sequelize(options);
    }

    public syncModels() {
        const Document = this.db.define('document', {
            id: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            name: DataTypes.STRING,
            documentType: DataTypes.STRING,
            initialState: DataTypes.JSON,
            lastModified: DataTypes.DATE,
            revision: DataTypes.INTEGER
        });

        const Operation = this.db.define('operation', {
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            documentId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            hash: DataTypes.STRING,
            index: {
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            input: DataTypes.JSON,
            timestamp: DataTypes.DATE,
            type: DataTypes.STRING,
            scope: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            branch: {
                type: DataTypes.STRING,
                primaryKey: true
            }
        });

        this.db.define('attachment', {
            driveId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            documentId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            scope: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            branch: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            index: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            hash: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            data: DataTypes.BLOB
        });

        // operation.hasMany(attachment);
        Document.hasMany(Operation, {
            onDelete: 'CASCADE'
        });
        Operation.belongsTo(Document);

        return this.db.sync({ force: true });
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
        const Document = this.db.models['document'];

        if (!Document) {
            throw new Error('Document model not found');
        }

        const result = await Document.create({
            id: id,
            driveId: drive,
            name: document.name,
            documentType: document.documentType,
            initialState: document.initialState,
            lastModified: document.lastModified,
            revision: document.revision
        });

        console.log('create doc', result.dataValues);
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

        const Operation = this.db.models['operation'];
        if (!Operation) {
            throw new Error('Operation model not found');
        }

        const result = await Promise.all(
            operations.map(async op => {
                return Operation.create({
                    driveId: drive,
                    documentId: id,
                    hash: op.hash,
                    index: op.index,
                    input: op.input,
                    timestamp: op.timestamp,
                    type: op.type,
                    scope: op.scope,
                    branch: 'main'
                });
            })
        );

        console.log(result);

        const Document = this.db.models['document'];
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.update(
            {
                lastModified: header.lastModified,
                revision: header.revision
            },
            {
                where: {
                    id: id,
                    driveId: drive
                }
            }
        );
    }

    async getDocuments(drive: string) {
        const Document = this.db.models['document'];
        if (!Document) {
            throw new Error('Document model not found');
        }

        const result = await Document.findAll({
            attributes: ['id'],
            where: {
                driveId: drive
            }
        });

        return result.map(e => e.dataValues.id);
    }

    async getDocument(driveId: string, id: string) {
        const Document = this.db.models['document'];
        if (!Document) {
            throw new Error('Document model not found');
        }

        const entry = await Document.findOne({
            where: {
                id: id,
                driveId: driveId
            },
            include: [
                {
                    model: this.db.models['operation'],
                    as: 'operations'
                }
            ]
        });

        if (entry === null) {
            throw new Error(`Document with id ${id} not found`);
        }

        const document = entry.dataValues;
        const Operation = this.db.models['operation'];
        if (!Operation) {
            throw new Error('Operation model not found');
        }

        const operations = document.operations.map(
            (op: {
                hash: string;
                index: number;
                timestamp: Date;
                input: JSON;
                type: string;
                scope: string;
            }) => ({
                hash: op.hash,
                index: op.index,
                timestamp: new Date(op.timestamp).toISOString(),
                input: op.input,
                type: op.type,
                scope: op.scope as OperationScope
                // attachments: fileRegistry
            })
        );

        const doc = {
            created: document.createdAt,
            name: document.name ? document.name : '',
            documentType: document.documentType,
            initialState: document.initialState as ExtendedState<
                DocumentDriveState,
                DocumentDriveLocalState
            >,
            lastModified: document.updatedAt,
            operations: {
                global: operations.filter(
                    (op: Operation) => op.scope === 'global'
                ),
                local: operations.filter(
                    (op: Operation) => op.scope === 'local'
                )
            },
            revision: document.revision
        };

        return doc;
    }

    async deleteDocument(drive: string, id: string) {
        const Document = this.db.models['document'];
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.destroy({
            where: {
                id: id,
                driveId: drive
            }
        });
    }

    async getDrives() {
        return this.getDocuments('drives');
    }

    async getDrive(id: string) {
        const doc = await this.getDocument('drives', id);
        return doc as DocumentDriveStorage;
    }

    async deleteDrive(id: string) {
        await this.deleteDocument('drives', id);

        const Document = this.db.models['document'];
        if (!Document) {
            throw new Error('Document model not found');
        }

        await Document.destroy({
            where: {
                driveId: id
            }
        });
    }
}

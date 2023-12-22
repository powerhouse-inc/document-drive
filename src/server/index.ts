import {
    DocumentDriveAction,
    DocumentDriveDocument,
    utils
} from 'document-model-libs/document-drive';
import {
    BaseAction,
    DocumentModel,
    Operation,
    utils as baseUtils
} from 'document-model/document';
import { IDriveStorage } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { isDocumentDrive } from '../utils';
import {
    CreateDocumentInput,
    DriveInput,
    IDocumentDriveServer,
    IOperationResult,
    SignalResult
} from './types';

export type * from './types';

export class DocumentDriveServer implements IDocumentDriveServer {
    private documentModels: DocumentModel[];
    private storage: IDriveStorage;

    constructor(
        documentModels: DocumentModel[],
        storage: IDriveStorage = new MemoryStorage()
    ) {
        this.documentModels = documentModels;
        this.storage = storage;
    }

    private _getDocumentModel(documentType: string) {
        const documentModel = this.documentModels.find(
            model => model.documentModel.id === documentType
        );
        if (!documentModel) {
            throw new Error(`Document type ${documentType} not supported`);
        }
        return documentModel;
    }

    async addDrive(drive: DriveInput) {
        const id = drive.global.id;
        if (!id) {
            throw new Error('Invalid Drive Id');
        }
        try {
            const driveStorage = await this.storage.getDrive(id);
            if (driveStorage) {
                throw new Error('Drive already exists');
            }
        } catch {
            // ignore error has it means drive does not exist already
        }
        const document = utils.createDocument({
            state: drive
        });
        return this.storage.createDrive(id, document);
    }

    deleteDrive(id: string) {
        return this.storage.deleteDrive(id);
    }

    getDrives() {
        return this.storage.getDrives();
    }

    async getDrive(drive: string) {
        const driveStorage = await this.storage.getDrive(drive);
        const documentModel = this._getDocumentModel(driveStorage.documentType);
        const document = baseUtils.replayDocument(
            driveStorage.initialState,
            driveStorage.operations,
            documentModel.reducer,
            undefined,
            driveStorage
        );
        if (!isDocumentDrive(document)) {
            throw new Error(
                `Document with id ${drive} is not a Document Drive`
            );
        } else {
            return document;
        }
    }

    async getDocument(drive: string, id: string) {
        const { initialState, operations, ...header } =
            await this.storage.getDocument(drive, id);

        const documentModel = this._getDocumentModel(header.documentType);

        return baseUtils.replayDocument(
            initialState,
            operations,
            documentModel.reducer,
            undefined,
            header
        );
    }

    getDocuments(drive: string) {
        return this.storage.getDocuments(drive);
    }

    async createDocument(driveId: string, input: CreateDocumentInput) {
        const documentModel = this._getDocumentModel(input.documentType);

        // TODO validate input.document is of documentType
        const document = input.document ?? documentModel.utils.createDocument();

        return this.storage.createDocument(driveId, input.id, document);
    }

    async deleteDocument(driveId: string, id: string) {
        return this.storage.deleteDocument(driveId, id);
    }

    addOperation(drive: string, id: string, operation: Operation) {
        return this.addOperations(drive, id, [operation]);
    }

    async addOperations(drive: string, id: string, operations: Operation[]) {
        // retrieves document from storage
        const documentStorage = await (id
            ? this.storage.getDocument(drive, id)
            : this.storage.getDrive(drive));
        try {
            // retrieves the document's document model and
            // applies the operations using its reducer
            const documentModel = this._getDocumentModel(
                documentStorage.documentType
            );
            const document = baseUtils.replayDocument(
                documentStorage.initialState,
                documentStorage.operations,
                documentModel.reducer,
                undefined,
                documentStorage
            );

            const signalHandlers: Promise<SignalResult>[] = [];
            const newDocument = operations.reduce(
                (document, operation) =>
                    documentModel.reducer(document, operation, signal => {
                        let handler: Promise<unknown> | undefined = undefined;
                        switch (signal.type) {
                            case 'CREATE_CHILD_DOCUMENT':
                                handler = this.createDocument(
                                    drive,
                                    signal.input
                                );
                                break;
                            case 'DELETE_CHILD_DOCUMENT':
                                handler = this.deleteDocument(
                                    drive,
                                    signal.input.id
                                );
                                break;
                            case 'COPY_CHILD_DOCUMENT':
                                handler = this.getDocument(
                                    drive,
                                    signal.input.id
                                ).then(documentToCopy =>
                                    this.createDocument(drive, {
                                        id: signal.input.newId,
                                        documentType:
                                            documentToCopy.documentType,
                                        document: documentToCopy
                                    })
                                );
                                break;
                        }
                        if (handler) {
                            signalHandlers.push(
                                handler.then(result => ({ signal, result }))
                            );
                        }
                    }),
                document
            );
            const signals = await Promise.all(signalHandlers);

            // saves the updated state of the document and returns it
            if (id) {
                await this.storage.addDocumentOperations(
                    drive,
                    id,
                    operations,
                    newDocument
                );
            } else if (isDocumentDrive(newDocument)) {
                await this.storage.addDriveOperations(
                    drive,
                    operations,
                    newDocument
                );
            } else {
                throw new Error('Invalid document');
            }

            return {
                success: true,
                document: newDocument,
                operations,
                signals
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                document: undefined,
                operations,
                signals: []
            };
        }
    }

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ) {
        return this.addOperation(drive, '', operation) as Promise<
            IOperationResult<DocumentDriveDocument>
        >;
    }

    addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ) {
        return this.addOperations(drive, '', operations) as Promise<
            IOperationResult<DocumentDriveDocument>
        >;
    }
}

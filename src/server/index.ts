import {
    DocumentDriveAction,
    DocumentDriveDocument,
    utils
} from 'document-model-libs/document-drive';
import { BaseAction, DocumentModel, Operation } from 'document-model/document';
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

    addDrive(drive: DriveInput) {
        const document = utils.createDocument({ state: drive });
        return this.storage.saveDrive(document);
    }

    deleteDrive(id: string) {
        return this.storage.deleteDrive(id);
    }

    getDrives() {
        return this.storage.getDrives();
    }

    getDrive(drive: string) {
        return this.storage.getDrive(drive);
    }

    getDocument(drive: string, id: string) {
        return this.storage.getDocument(drive, id);
    }

    getDocuments(drive: string) {
        return this.storage.getDocuments(drive);
    }

    async createDocument(driveId: string, input: CreateDocumentInput) {
        const documentModel = this._getDocumentModel(input.documentType);

        // TODO validate input.document is of documentType
        const document = input.document ?? documentModel.utils.createDocument();

        return this.storage.saveDocument(driveId, input.id, document);
    }

    async deleteDocument(driveId: string, id: string): Promise<void> {
        return this.storage.deleteDocument(driveId, id);
    }

    async addOperation(drive: string, id: string, operation: Operation) {
        // retrieves document from storage
        const document = await (id
            ? this.storage.getDocument(drive, id)
            : this.storage.getDrive(drive));
        try {
            // retrieves the document's document model and
            // applies operation using its reducer
            const documentModel = this._getDocumentModel(document.documentType);
            const signalHandlers: Promise<SignalResult>[] = [];
            const newDocument = documentModel.reducer(
                document,
                operation,
                signal => {
                    let handler: Promise<unknown> | undefined = undefined;
                    switch (signal.type) {
                        case 'CREATE_CHILD_DOCUMENT':
                            handler = this.createDocument(drive, signal.input);
                            break;
                        case 'DELETE_CHILD_DOCUMENT':
                            handler = this.deleteDocument(
                                drive,
                                signal.input.id
                            );
                            break;
                        case 'COPY_CHILD_DOCUMENT':
                            console.log(signal.input);
                            handler = this.getDocument(
                                drive,
                                signal.input.id
                            ).then(documentToCopy =>
                                this.createDocument(drive, {
                                    id: signal.input.newId,
                                    documentType: documentToCopy.documentType,
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
                }
            );
            const signals = await Promise.all(signalHandlers);

            // saves the updated state of the document and returns it
            if (id) {
                await this.storage.saveDocument(drive, id, newDocument);
            } else if (isDocumentDrive(newDocument)) {
                await this.storage.saveDrive(newDocument);
            } else {
                throw new Error('Invalid document');
            }
            return {
                success: true,
                document: newDocument,
                operation,
                signals
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                document,
                operation,
                signals: []
            };
        }
    }

    async addOperations(drive: string, id: string, operations: Operation[]) {
        const results: IOperationResult[] = [];
        for (const operation of operations) {
            results.push(await this.addOperation(drive, id, operation));
        }
        return results;
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
            IOperationResult<DocumentDriveDocument>[]
        >;
    }
}

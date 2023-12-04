import {
    DocumentDriveAction,
    DocumentDriveDocument,
    utils
} from 'document-model-libs/document-drive';
import {
    BaseAction,
    Document,
    DocumentModel,
    Operation
} from 'document-model/document';
import { IDriveStorage } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { isDocumentDrive } from '../utils';
import { CreateDocumentInput, DriveInput, IDocumentDriveServer } from './types';

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

    async addOperation(
        drive: string,
        id: string,
        operation: Operation
    ): Promise<Document> {
        // retrieves document from storage
        const document = await (id
            ? this.storage.getDocument(drive, id)
            : this.storage.getDrive(drive));

        // retrieves the document's document model and
        // applies operation using its reducer
        const documentModel = this._getDocumentModel(document.documentType);
        const signalResults: Promise<unknown>[] = [];
        const newDocument = documentModel.reducer(
            document,
            operation,
            signal => {
                let result: Promise<unknown> | undefined = undefined;
                switch (signal.type) {
                    case 'CREATE_CHILD_DOCUMENT':
                        result = this.createDocument(drive, signal.input);
                        break;
                    case 'DELETE_CHILD_DOCUMENT':
                        result = this.deleteDocument(drive, signal.input.id);
                        break;
                }
                if (result) {
                    signalResults.push(result);
                }
            }
        );
        await Promise.all(signalResults);
        // saves the updated state of the document and returns it
        if (id) {
            await this.storage.saveDocument(drive, id, newDocument);
        } else if (isDocumentDrive(newDocument)) {
            await this.storage.saveDrive(newDocument);
        } else {
            throw new Error('Invalid document');
        }
        return newDocument;
    }

    async addOperations(drive: string, id: string, operations: Operation[]) {
        let document: Document | null = null;
        for (const operation of operations) {
            document = await this.addOperation(drive, id, operation);
        }
        if (!document) {
            throw new Error('Document not found');
        }
        return document;
    }

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ): Promise<DocumentDriveDocument> {
        return this.addOperation(
            drive,
            '',
            operation
        ) as Promise<DocumentDriveDocument>;
    }

    addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ): Promise<DocumentDriveDocument> {
        return this.addOperations(
            drive,
            '',
            operations
        ) as Promise<DocumentDriveDocument>;
    }
}

import { utils } from 'document-model-libs/document-drive';
import { Document, DocumentModel, Operation } from 'document-model/document';
import { MemoryStorage } from './storage/memory';
import {
    CreateDocumentInput,
    DriveInput,
    IDocumentDriveServer,
    IDriveStorage
} from './types';
import { isDocumentDrive } from './utils';

export * from './types';

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
        const document = documentModel.utils.createDocument({
            //  state: input.initialState, TODO add initial state
        });

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
        const newDocument = documentModel.reducer(
            document,
            operation,
            signal => {
                switch (signal.type) {
                    case 'CREATE_CHILD_DOCUMENT':
                        this.createDocument(drive, signal.input);
                        break;
                }
            }
        );

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
}

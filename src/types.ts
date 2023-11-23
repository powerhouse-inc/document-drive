import {
    DocumentDriveDocument,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import { Document, Operation } from 'document-model/document';

export type DriveInput = Omit<
    DocumentDriveState,
    '__typename' | 'remoteUrl' | 'nodes'
>;

export type CreateDocumentInput = {
    id: string;
    documentType: string;
    // initialState?: ExtendedState<S>; TODO add support for initial state
};

export interface SortOptions {
    afterNodePath?: string;
}

export interface IDocumentDriveServer {
    addDrive(drive: DriveInput): Promise<void>;
    deleteDrive(id: string): Promise<void>;
    getDrive(id: string): Promise<DocumentDriveDocument>;

    getDocuments: (drive: string) => Promise<string[]>;
    getDocument: (drive: string, id: string) => Promise<Document>;
    createDocument(drive: string, document: CreateDocumentInput): Promise<void>;
    deleteDocument(drive: string, id: string): Promise<void>;

    addOperation(
        drive: string,
        id: string,
        operation: Operation
    ): Promise<Document>;
}

export interface IStorage {
    getDocuments: (drive: string) => Promise<string[]>;
    getDocument(drive: string, id: string): Promise<Document>;
    saveDocument(drive: string, id: string, document: Document): Promise<void>;
    deleteDocument(drive: string, id: string): Promise<void>;
}

export interface IDriveStorage extends IStorage {
    getDrives(): Promise<string[]>;
    getDrive(id: string): Promise<DocumentDriveDocument>;
    saveDrive(drive: DocumentDriveDocument): Promise<void>;
    deleteDrive(id: string): Promise<void>;
}

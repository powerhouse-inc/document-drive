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
    document?: Document;
};

export interface SortOptions {
    afterNodePath?: string;
}

export interface IDocumentDriveServer {
    getDrives(): Promise<string[]>;
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
    addOperations(
        operations: { drive: string; id: string; operation: Operation }[]
    ): Promise<Document[]>;
}

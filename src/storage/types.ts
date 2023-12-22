import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document, DocumentHeader, Operation } from 'document-model/document';

export type DocumentStorage<D extends Document = Document> = Omit<
    D,
    'state' | 'attachments'
>;
export type DocumentDriveStorage = DocumentStorage<DocumentDriveDocument>;

export interface IStorage {
    getDocuments: (drive: string) => Promise<string[]>;
    getDocument(drive: string, id: string): Promise<DocumentStorage>;
    createDocument(
        drive: string,
        id: string,
        document: DocumentStorage
    ): Promise<void>;
    addDocumentOperations(
        drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void>;
    deleteDocument(drive: string, id: string): Promise<void>;
}

export interface IDriveStorage extends IStorage {
    getDrives(): Promise<string[]>;
    getDrive(id: string): Promise<DocumentDriveStorage>;
    createDrive(id: string, drive: DocumentDriveStorage): Promise<void>;
    deleteDrive(id: string): Promise<void>;
    addDriveOperations(
        id: string,
        operations: Operation[],
        header: DocumentHeader
    ): Promise<void>;
}

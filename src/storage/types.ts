import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';

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

import type {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveLocalState,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import type {
    BaseAction,
    Document,
    Operation,
    Signal,
    State
} from 'document-model/document';

export type DriveInput = State<
    Omit<DocumentDriveState, '__typename' | 'nodes'>,
    DocumentDriveLocalState
>;

export type CreateDocumentInput = {
    id: string;
    documentType: string;
    document?: Document;
};

export type SignalResult = {
    signal: Signal;
    result: unknown; // infer from return types on document-model
};

export type IOperationResult<T extends Document = Document> = {
    success: boolean;
    error?: Error;
    operation: Operation;
    document: T;
    signals: SignalResult[];
};

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
    ): Promise<IOperationResult>;
    addOperations(
        drive: string,
        id: string,
        operations: Operation[]
    ): Promise<IOperationResult[]>;

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ): Promise<IOperationResult<DocumentDriveDocument>[]>;
}

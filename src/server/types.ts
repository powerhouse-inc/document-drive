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
    OperationScope,
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
    operations: Operation[];
    document: T | undefined;
    signals: SignalResult[];
};

export type Listener = {
    listenerId: string;
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
};

export type CreateListenerInput = {
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
};

export type ListenerCallInfo = {
    transmitterType: TransmitterType;
    name: string;
    data: string;
};

export enum TransmitterType {
    Internal,
    SwitchboardPush,
    PullResponder,
    SecureConnect,
    MatrixConnect,
    RESTWebhook
}

export type ListenerFilter = {
    documentType: string[];
    documentId: string[];
    scope: string[];
    branch: string[];
};

export type ListenerRevision = {
    driveId: string;
    documentId: string;
    scope: string;
    branch: string;
    status: UpdateStatus;
    revision: number;
};

export enum UpdateStatus {
    SUCCESS,
    MISSING,
    CONFLICT,
    ERROR
}

export type StrandUpdate = {
    driveId: string;
    documentId: string;
    scope: OperationScope;
    branch: string;
    operations: OperationUpdate[];
};

// maybe change to Operation?
export type OperationUpdate = {
    revision: number;
    skip: number;
    name: string;
    input: string;
    hash: string;
    type: string;
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
    ): Promise<IOperationResult>;

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    registerListener(input: CreateListenerInput): Promise<Listener>;
    removeListener(listenerId: string): Promise<boolean>;
    cleanAllListener(): Promise<boolean>;

    pushStrands(strands: StrandUpdate[]): Promise<ListenerRevision[]>;
    getStrands(listenerId: string): Promise<StrandUpdate[]>;
    getStrandsSince(listenerId: string, since: Date): Promise<StrandUpdate[]>;
}

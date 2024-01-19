import type {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveLocalState,
    DocumentDriveState,
    ListenerCallInfo
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

export type SynchronizationUnit = {
    syncId: string;
    driveId: string;
    documentId: string;
    documentType: string;
    scope: string;
    branch: string;
    lastUpdated: string;
    revision: number;
};

export type DocumentOperations = {
    syncId: string;
    revision: number;
    committed: string;
    operation: string;
    params: object;
    stateHash: string;
    skip: number;
};

export type Listener = {
    driveId: string;
    listenerId: string;
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
};

export type CreateListenerInput = {
    driveId: string;
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
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
    documentType?: string[];
    documentId?: string[];
    scope?: string[];
    branch?: string[];
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
    SUCCESS = 'SUCCESS',
    MISSING = 'MISSING',
    CONFLICT = 'CONFLICT',
    ERROR = 'ERROR'
}

export type StrandUpdate = {
    driveId: string;
    documentId: string;
    scope: OperationScope;
    branch: string;
    operations: Operation[];
};

// maybe change to Operation?
export type OperationUpdate = Operation & {
    revision: number;
    skip: number;
    name: string;
    input: string;
    hash: string;
    type: string;
};

export abstract class BaseDocumentDriveServer {
    /** Public methods **/
    abstract getDrives(): Promise<string[]>;
    abstract addDrive(drive: DriveInput): Promise<void>;
    abstract deleteDrive(id: string): Promise<void>;
    abstract getDrive(id: string): Promise<DocumentDriveDocument>;

    abstract getDocuments(drive: string): Promise<string[]>;
    abstract getDocument(drive: string, id: string): Promise<Document>;

    /** Synchronization methods */
    public abstract getSynchronizationUnits: (
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[]
    ) => Promise<SynchronizationUnit[]>;

    public abstract getSynchronizationUnit(
        driveId: string,
        syncId: string
    ): Promise<SynchronizationUnit>;

    protected abstract getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string;
            fromRevision?: number;
        }
    ): Promise<DocumentOperations[]>;

    /** Internal methods **/
    protected abstract createDocument(
        drive: string,
        document: CreateDocumentInput
    ): Promise<void>;
    protected abstract deleteDocument(drive: string, id: string): Promise<void>;

    protected abstract addOperation(
        drive: string,
        id: string,
        operation: Operation
    ): Promise<IOperationResult<Document>>;
    protected abstract addOperations(
        drive: string,
        id: string,
        operations: Operation[]
    ): Promise<IOperationResult<Document>>;
    protected abstract addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    protected abstract addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ): Promise<IOperationResult<DocumentDriveDocument>>;
}

export abstract class BaseListenerManager {
    protected drive: BaseDocumentDriveServer;
    protected cache: ListenerStateCacheEntry[];

    constructor(
        drive: BaseDocumentDriveServer,
        cache: ListenerStateCacheEntry[] = []
    ) {
        this.drive = drive;
        this.cache = cache;
    }

    abstract init(): Promise<void>;
    abstract addListener(listener: Listener): Promise<void>;
    abstract removeListener(listenerUd: string): Promise<boolean>;
    abstract updateSynchronizationRevision(
        driveId: string,
        syncId: string,
        syncRev: number
    ): Promise<void>;

    abstract updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void>;
}

export type IDocumentDriveServer = Pick<
    BaseDocumentDriveServer,
    keyof BaseDocumentDriveServer
>;

export enum ListenerStatus {
    CREATED,
    PENDING,
    SUCCESS,
    MISSING,
    CONFLICT,
    ERROR
}

export interface ListenerStateCacheEntry {
    listenerId: string;
    driveId: string;
    syncId: string;
    syncRev: number;
    block: boolean;
    listenerRev: number;
    listenerStatus: ListenerStatus;
    pendingTimeout: string;
    listener: Listener;
    syncUnit: SynchronizationUnit;
}

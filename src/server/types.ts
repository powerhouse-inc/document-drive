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
import { ITransmitter } from '../transmitter/types';

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

export type OperationUpdate = {
    committed: string;
    revision: number;
    skip: number;
    operation: string;
    input: object;
    hash: string;
};

export type StrandUpdate = {
    driveId: string;
    documentId: string;
    scope: OperationScope;
    branch: string;
    operations: OperationUpdate[];
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
    abstract getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[]
    ): Promise<SynchronizationUnit[]>;

    abstract getSynchronizationUnit(
        driveId: string,
        syncId: string
    ): Promise<SynchronizationUnit>;

    abstract getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string;
            fromRevision?: number;
        }
    ): Promise<OperationUpdate[]>;

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

    abstract getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined>;
}

export abstract class BaseListenerManager {
    protected drive: BaseDocumentDriveServer;
    protected listenerState: Map<string, Map<string, ListenerState>> =
        new Map();
    protected transmitters: Record<
        DocumentDriveState['id'],
        Record<Listener['listenerId'], ITransmitter>
    > = {};

    constructor(
        drive: BaseDocumentDriveServer,
        listenerState: Map<string, Map<string, ListenerState>> = new Map()
    ) {
        this.drive = drive;
        this.listenerState = listenerState;
    }

    abstract init(): Promise<void>;
    abstract addListener(listener: Listener): Promise<ITransmitter>;
    abstract removeListener(
        driveId: string,
        listenerId: string
    ): Promise<boolean>;
    abstract getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined>;
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

export interface ListenerState {
    driveId: string;
    block: boolean;
    pendingTimeout: string;
    listener: Listener;
    syncUnits: SyncronizationUnitState[];
    listenerStatus: ListenerStatus;
}

export interface SyncronizationUnitState extends SynchronizationUnit {
    listenerRev: number;
    syncRev: number;
}

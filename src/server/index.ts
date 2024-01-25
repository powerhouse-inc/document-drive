import {
    AddListenerInput,
    DocumentDriveAction,
    DocumentDriveDocument,
    FileNode,
    ListenerFilter,
    RemoveListenerInput,
    isFileNode,
    utils
} from 'document-model-libs/document-drive';
import {
    BaseAction,
    DocumentModel,
    Operation,
    OperationScope,
    utils as baseUtils
} from 'document-model/document';
import { DocumentStorage, IDriveStorage } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { isDocumentDrive } from '../utils';
import { ListenerManager } from './listener/manager';
import { PullResponderTransmitter } from './listener/transmitter';
import { ITransmitter } from './listener/transmitter/types';
import {
    BaseDocumentDriveServer,
    CreateDocumentInput,
    DriveInput,
    OperationUpdate,
    SignalResult,
    SynchronizationUnit
} from './types';

export * from './listener';
export type * from './types';

export const PULL_DRIVE_INTERVAL = 30000;

export class DocumentDriveServer extends BaseDocumentDriveServer {
    private documentModels: DocumentModel[];
    private storage: IDriveStorage;
    private listenerStateManager: ListenerManager;
    private syncDrivesMap: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        documentModels: DocumentModel[],
        storage: IDriveStorage = new MemoryStorage()
    ) {
        super();
        this.listenerStateManager = new ListenerManager(this);
        this.documentModels = documentModels;
        this.storage = storage;
    }

    private shouldSyncDrive(drive: DocumentDriveDocument) {
        return (
            drive.state.global.remoteUrl &&
            drive.state.local.sharingType !== 'private' &&
            drive.state.local.availableOffline
        );
    }

    private async startSyncRemoteDrive(
        driveId: string,
        filter?: ListenerFilter
    ) {
        const drive = await this.getDrive(driveId);
        const sync = this.syncDrivesMap.get(driveId);
        if (sync) {
            return;
        }

        const { remoteUrl } = drive.state.global;
        if (!remoteUrl) {
            throw new Error('Remote drive URL not found');
        }

        const listenerId = await PullResponderTransmitter.registerPullResponder(
            driveId,
            remoteUrl,
            filter ?? {
                documentId: ['*'],
                documentType: ['*'],
                branch: ['*'],
                scope: ['*']
            }
        );

        // TODO save listener on local state

        const timeoutId = setInterval(async () => {
            /** TODO pull operations */
            const strands = await PullResponderTransmitter.pullStrands(
                driveId,
                remoteUrl,
                listenerId
                // since ?
            );

            for (const strand of strands) {
                const operations: Operation[] = strand.operations.map(
                    ({
                        revision,
                        operation,
                        hash,
                        input,
                        skip,
                        committed
                    }) => ({
                        index: revision,
                        type: operation,
                        hash,
                        input,
                        skip,
                        scope: strand.scope,
                        branch: strand.branch,
                        timestamp: committed
                    })
                );

                try {
                    !strand.documentId
                        ? await this.addDriveOperations(
                              strand.driveId,
                              operations
                          )
                        : await this.addOperations(
                              driveId,
                              strand.documentId,
                              operations
                          );
                } catch (e) {
                    console.error('Sync error', e);
                }
            }
        }, PULL_DRIVE_INTERVAL);

        this.syncDrivesMap.set(driveId, timeoutId);
    }

    private async stopSyncRemoteDrive(driveId: string) {
        const sync = this.syncDrivesMap.get(driveId);
        if (!sync) {
            return;
        }
        clearInterval(sync);
        this.syncDrivesMap.delete(driveId);
    }

    async initialize() {
        await this.listenerStateManager.init();
    }

    public async getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[]
    ) {
        const drive = await this.getDrive(driveId);

        const nodes = drive.state.global.nodes.filter(
            node =>
                isFileNode(node) &&
                (!documentId?.length || documentId.includes(node.id)) // TODO support * as documentId
        ) as FileNode[];

        if (documentId && !nodes.length) {
            throw new Error('File node not found');
        }

        const synchronizationUnits: SynchronizationUnit[] = [];

        for (const node of nodes) {
            const nodeUnits =
                scope?.length || branch?.length
                    ? node.synchronizationUnits.filter(
                          unit =>
                              (!scope?.length || scope.includes(unit.scope)) &&
                              (!branch?.length || branch.includes(unit.branch))
                      )
                    : node.synchronizationUnits;
            if (!nodeUnits.length) {
                continue;
            }

            const document = await this.getDocument(driveId, node.id);

            for (const { syncId, scope, branch } of nodeUnits) {
                const operations =
                    document.operations[scope as OperationScope] ?? [];
                const lastOperation = operations.pop();
                synchronizationUnits.push({
                    syncId,
                    scope,
                    branch,
                    driveId,
                    documentId: node.id,
                    documentType: node.documentType,
                    lastUpdated:
                        lastOperation?.timestamp ?? document.lastModified,
                    revision: lastOperation?.index ?? 0
                });
            }
        }
        return synchronizationUnits;
    }

    public async getSynchronizationUnit(
        driveId: string,
        syncId: string
    ): Promise<SynchronizationUnit> {
        const drive = await this.getDrive(driveId);
        const node = drive.state.global.nodes.find(
            node =>
                isFileNode(node) &&
                node.synchronizationUnits.find(unit => unit.syncId === syncId)
        );

        if (!node || !isFileNode(node)) {
            throw new Error('Synchronization unit not found');
        }

        const { scope, branch } = node.synchronizationUnits.find(
            unit => unit.syncId === syncId
        )!;

        const documentId = node.id;
        const document = await this.getDocument(driveId, documentId);
        const operations = document.operations[scope as OperationScope] ?? [];
        const lastOperation = operations.pop();

        return {
            syncId,
            scope,
            branch,
            driveId,
            documentId,
            documentType: node.documentType,
            lastUpdated: lastOperation?.timestamp ?? document.lastModified,
            revision: lastOperation?.index ?? 0
        };
    }

    async getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string | undefined;
            fromRevision?: number | undefined;
        }
    ): Promise<OperationUpdate[]> {
        const { documentId, scope } = await this.getSynchronizationUnit(
            driveId,
            syncId
        );

        const document = await this.getDocument(driveId, documentId); // TODO replace with getDocumentOperations
        const operations = document.operations[scope as OperationScope] ?? []; // TODO filter by branch also
        const filteredOperations = operations.filter(
            operation =>
                Object.keys(filter).length === 0 ||
                (filter.since !== undefined &&
                    filter.since <= operation.timestamp) ||
                (filter.fromRevision !== undefined &&
                    operation.index >= filter.fromRevision)
        );

        return filteredOperations.map(operation => ({
            hash: operation.hash,
            revision: operation.index,
            committed: operation.timestamp,
            operation: operation.type,
            input: operation.input as object,
            skip: operation.skip
        }));
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

    async addDrive(drive: DriveInput) {
        const id = drive.global.id;
        if (!id) {
            throw new Error('Invalid Drive Id');
        }
        try {
            const driveStorage = await this.storage.getDrive(id);
            if (driveStorage) {
                throw new Error('Drive already exists');
            }
        } catch {
            // ignore error has it means drive does not exist already
        }
        const document = utils.createDocument({
            state: drive
        });

        await this.storage.createDrive(id, document);

        // add listeners to state manager
        for (const listener of drive.local.listeners) {
            await this.listenerStateManager.addListener({
                block: listener.block,
                driveId: id,
                filter: {
                    branch: listener.filter.branch ?? [],
                    documentId: listener.filter.documentId ?? [],
                    documentType: listener.filter.documentType ?? [],
                    scope: listener.filter.scope ?? []
                },
                listenerId: listener.listenerId,
                system: listener.system,
                callInfo: listener.callInfo ?? undefined,
                label: listener.label ?? ''
            });
        }

        // if it is a remote drive that should be available offline, starts
        // the sync process to pull changes from remote every 30 seconds
        if (this.shouldSyncDrive(document)) {
            await this.startSyncRemoteDrive(drive.global.id);
        }
    }

    deleteDrive(id: string) {
        this.stopSyncRemoteDrive(id);
        return this.storage.deleteDrive(id);
    }

    getDrives() {
        return this.storage.getDrives();
    }

    async getDrive(drive: string) {
        const driveStorage = await this.storage.getDrive(drive);
        const documentModel = this._getDocumentModel(driveStorage.documentType);
        const document = baseUtils.replayDocument(
            driveStorage.initialState,
            driveStorage.operations,
            documentModel.reducer,
            undefined,
            driveStorage
        );
        if (!isDocumentDrive(document)) {
            throw new Error(
                `Document with id ${drive} is not a Document Drive`
            );
        } else {
            return document;
        }
    }

    async getDocument(drive: string, id: string) {
        const { initialState, operations, ...header } =
            await this.storage.getDocument(drive, id);

        const documentModel = this._getDocumentModel(header.documentType);

        return baseUtils.replayDocument(
            initialState,
            operations,
            documentModel.reducer,
            undefined,
            header
        );
    }

    getDocuments(drive: string) {
        return this.storage.getDocuments(drive);
    }

    protected async createDocument(
        driveId: string,
        input: CreateDocumentInput
    ) {
        const documentModel = this._getDocumentModel(input.documentType);
        // TODO validate input.document is of documentType
        const document = input.document ?? documentModel.utils.createDocument();

        await this.storage.createDocument(driveId, input.id, document);

        await this.listenerStateManager.addSyncUnits(
            input.synchronizationUnits.map(({ syncId, scope, branch }) => {
                const lastOperation = document.operations[scope].slice().pop();
                return {
                    syncId,
                    scope,
                    branch,
                    driveId,
                    documentId: input.id,
                    documentType: document.documentType,
                    lastUpdated:
                        lastOperation?.timestamp ?? document.lastModified,
                    revision: lastOperation?.index ?? 0
                };
            })
        );
        return document;
    }

    async deleteDocument(driveId: string, id: string) {
        return this.storage.deleteDocument(driveId, id);
    }

    private async _performOperations(
        drive: string,
        documentStorage: DocumentStorage,
        operations: Operation[]
    ) {
        const documentModel = this._getDocumentModel(
            documentStorage.documentType
        );
        const document = baseUtils.replayDocument(
            documentStorage.initialState,
            documentStorage.operations,
            documentModel.reducer,
            undefined,
            documentStorage
        );

        const signalResults: SignalResult[] = [];
        let newDocument = document;
        for (const operation of operations) {
            const operationSignals: Promise<SignalResult>[] = [];
            newDocument = documentModel.reducer(
                newDocument,
                operation,
                signal => {
                    let handler: Promise<unknown> | undefined = undefined;
                    switch (signal.type) {
                        case 'CREATE_CHILD_DOCUMENT':
                            handler = this.createDocument(drive, signal.input);
                            break;
                        case 'DELETE_CHILD_DOCUMENT':
                            handler = this.deleteDocument(
                                drive,
                                signal.input.id
                            );
                            break;
                        case 'COPY_CHILD_DOCUMENT':
                            handler = this.getDocument(
                                drive,
                                signal.input.id
                            ).then(documentToCopy =>
                                this.createDocument(drive, {
                                    id: signal.input.newId,
                                    documentType: documentToCopy.documentType,
                                    document: documentToCopy,
                                    synchronizationUnits:
                                        signal.input.synchronizationUnits // TODO add this to COPY_CHILD_DOCUMENT signal input on document-model
                                })
                            );
                            break;
                    }
                    if (handler) {
                        operationSignals.push(
                            handler.then(result => ({ signal, result }))
                        );
                    }
                }
            );
            const results = await Promise.all(operationSignals);
            signalResults.push(...results);

            if (operation.type === 'ADD_LISTENER') {
                const { listener } = operation.input as AddListenerInput;
                await this.listenerStateManager.addListener({
                    ...listener,
                    driveId: drive,
                    label: listener.label ?? '',
                    system: listener.system ?? false,
                    filter: {
                        branch: listener.filter.branch ?? [],
                        documentId: listener.filter.documentId ?? [],
                        documentType: listener.filter.documentType ?? [],
                        scope: listener.filter.scope ?? []
                    },
                    callInfo: {
                        data: listener.callInfo?.data ?? '',
                        name: listener.callInfo?.name ?? 'PullResponder',
                        transmitterType:
                            listener.callInfo?.transmitterType ??
                            'PullResponder'
                    }
                });
            } else if (operation.type === 'REMOVE_LISTENER') {
                const { listenerId } = operation.input as RemoveListenerInput;
                await this.listenerStateManager.removeListener(
                    drive,
                    listenerId
                );
            }
        }
        return { document: newDocument, signals: signalResults };
    }

    addOperation(drive: string, id: string, operation: Operation) {
        return this.addOperations(drive, id, [operation]);
    }

    async addOperations(drive: string, id: string, operations: Operation[]) {
        // retrieves document from storage
        const documentStorage = await this.storage.getDocument(drive, id);
        try {
            // retrieves the document's document model and
            // applies the operations using its reducer
            const { document, signals } = await this._performOperations(
                drive,
                documentStorage,
                operations
            );

            // saves the updated state of the document and returns it
            await this.storage.addDocumentOperations(
                drive,
                id,
                operations,
                document
            );

            // gets all the different scopes and branches combinations from the operations
            const { scopes, branches } = operations.reduce(
                (acc, operation) => {
                    if (!acc.scopes.includes(operation.scope)) {
                        acc.scopes.push(operation.scope);
                    }
                    return acc;
                },
                { scopes: [] as string[], branches: ['main'] }
            );

            const syncUnits = await this.getSynchronizationUnits(
                drive,
                [id],
                scopes,
                branches
            );
            // update listener cache
            for (const syncUnit of syncUnits) {
                await this.listenerStateManager.updateSynchronizationRevision(
                    drive,
                    syncUnit.syncId,
                    syncUnit.revision,
                    syncUnit.lastUpdated
                );
            }

            return {
                success: true,
                document,
                operations,
                signals
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                document: undefined,
                operations,
                signals: []
            };
        }
    }

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ) {
        return this.addDriveOperations(drive, [operation]);
    }

    async addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ) {
        // retrieves document from storage
        const documentStorage = await this.storage.getDrive(drive);
        try {
            // retrieves the document's document model and
            // applies the operations using its reducer
            const { document, signals } = await this._performOperations(
                drive,
                documentStorage,
                operations
            );

            if (isDocumentDrive(document)) {
                await this.storage.addDriveOperations(
                    drive,
                    operations as Operation<DocumentDriveAction | BaseAction>[], // TODO check?
                    document
                );

                if (this.shouldSyncDrive(document)) {
                    this.startSyncRemoteDrive(document.state.global.id);
                } else {
                    this.stopSyncRemoteDrive(document.state.global.id);
                }
            } else {
                throw new Error('Invalid Document Drive document');
            }

            return {
                success: true,
                document,
                operations,
                signals
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                document: undefined,
                operations,
                signals: []
            };
        }
    }

    getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined> {
        return this.listenerStateManager.getTransmitter(driveId, listenerId);
    }
}

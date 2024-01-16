import {
    DocumentDriveAction,
    actions,
    isFileNode,
    reducer,
    utils
} from 'document-model-libs/document-drive';
import {
    BaseAction,
    Document,
    DocumentModel,
    Operation,
    OperationScope,
    utils as baseUtils
} from 'document-model/document';
import { DocumentStorage, IDriveStorage } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { generateUUID, isDocumentDrive } from '../utils';
import {
    BaseDocumentDriveServer,
    CreateDocumentInput,
    CreateListenerInput,
    DocumentOperations,
    DriveInput,
    Listener,
    ListenerRevision,
    SignalResult,
    StrandUpdate,
    SynchronizationUnit,
    UpdateStatus
} from './types';

export type * from './types';

export class DocumentDriveServer implements BaseDocumentDriveServer {
    private documentModels: DocumentModel[];
    private storage: IDriveStorage;

    constructor(
        documentModels: DocumentModel[],
        storage: IDriveStorage = new MemoryStorage()
    ) {
        this.documentModels = documentModels;
        this.storage = storage;
    }

    protected async getSynchronizationUnits(
        driveId: string,
        documentId: string,
        scope?: string,
        branch?: string
    ) {
        const drive = await this.getDrive(driveId);
        const node = drive.state.global.nodes.find(
            node => isFileNode(node) && node.id === documentId
        );

        if (!node || !isFileNode(node)) {
            throw new Error('File node not found');
        }

        const document = await this.getDocument(driveId, documentId);

        const synchronizationUnits = node.synchronizationUnits
            .filter(
                unit =>
                    (scope === undefined || unit.scope === scope) &&
                    (branch === undefined || unit.branch === branch)
            )
            .map(({ syncId, scope, branch }) => {
                const operations =
                    document.operations[scope as OperationScope] ?? [];
                const lastOperation = operations.pop();

                return {
                    syncId,
                    scope,
                    branch,
                    driveId,
                    documentId,
                    documentType: node.documentType,
                    lastUpdated:
                        lastOperation?.timestamp ?? document.lastModified,
                    revision: lastOperation?.index ?? 0
                };
            });

        if (!synchronizationUnits.length) {
            throw new Error('Synchronization unit not found');
        }
        return synchronizationUnits;
    }

    protected async getSynchronizationUnit(
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
    protected async getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string | undefined;
            fromRevision?: number | undefined;
        }
    ): Promise<DocumentOperations[]> {
        const { documentId, scope } = await this.getSynchronizationUnit(
            driveId,
            syncId
        );

        const document = await this.getDocument(driveId, documentId); // TODO replace with getDocumentOperations
        const operations = document.operations[scope as OperationScope] ?? []; // TODO filter by branch also
        const filteredOperations = operations.filter(
            operation =>
                Object.keys(filter).length === 0 ||
                (filter.since && filter.since <= operation.timestamp) ||
                (filter.fromRevision && operation.index >= filter.fromRevision)
        );

        return filteredOperations.map(operation => ({
            syncId,
            revision: operation.index,
            committed: operation.timestamp,
            operation: operation.type,
            params: operation.input as object,
            stateHash: operation.hash,
            skip: 0 // TODO operation.skip
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

    private async _createSynchronizationUnits(
        driveId: string,
        nodeId: string,
        document: Document
    ) {
        const branch = 'main';
        const scopes = Object.keys(document.operations);
        let drive = await this.getDrive(driveId);
        const node = drive.state.global.nodes.find(node => node.id === nodeId);
        if (!node || !isFileNode(node)) {
            throw new Error(`Node with id: ${nodeId} is not a file`);
        }

        const operations = [] as Operation<DocumentDriveAction>[];
        for (const scope of scopes) {
            // checks if there already exists a synchronization unit for the scope and branch
            if (
                node.synchronizationUnits.find(
                    unit => unit.scope === scope && unit.branch == branch
                )
            ) {
                continue;
            }

            drive = reducer(
                drive,
                actions.addSynchronizationUnit({
                    syncId: generateUUID(),
                    file: nodeId,
                    scope,
                    branch
                })
            );
            const operation = drive.operations.global[
                drive.operations.global.length - 1
            ] as Operation<DocumentDriveAction>;
            operations.push(operation);
        }

        if (operations.length) {
            await this.addDriveOperations(driveId, operations);
        }
    }

    private async _documentCreated(driveId: string, documentId: string) {
        const document = await this.getDocument(driveId, documentId);
        return this._createSynchronizationUnits(driveId, documentId, document);
    }

    private async _documentDeleted(driveId: string, documentId: string) {
        // TODO update synchronization units index?
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
        return this.storage.createDrive(id, document);
    }

    deleteDrive(id: string) {
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

    async createDocument(driveId: string, input: CreateDocumentInput) {
        const documentModel = this._getDocumentModel(input.documentType);

        // TODO validate input.document is of documentType
        const document = input.document ?? documentModel.utils.createDocument();

        await this.storage.createDocument(driveId, input.id, document);
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
                                    document: documentToCopy
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

            // creates new synchronization units in case new scopes were created
            await this._createSynchronizationUnits(drive, id, document);

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
            } else {
                throw new Error('Invalid Document Drive document');
            }

            // filter out signals that created a document that was deleted by a subsequent
            // signal as there is no need to create synchronization units for it
            const signalResults = signals
                .map(signal => signal.signal)
                .filter(
                    (signal, index, array) =>
                        !(
                            (signal.type === 'CREATE_CHILD_DOCUMENT' ||
                                signal.type === 'COPY_CHILD_DOCUMENT') &&
                            array
                                .slice(index)
                                .find(
                                    nextSignal =>
                                        nextSignal.type ===
                                            'DELETE_CHILD_DOCUMENT' &&
                                        nextSignal.input.id === signal.input.id
                                )
                        )
                );
            // updates the synchronization units of the drive
            for (const signal of signalResults) {
                if (
                    signal.type === 'CREATE_CHILD_DOCUMENT' ||
                    signal.type === 'COPY_CHILD_DOCUMENT'
                ) {
                    await this._documentCreated(drive, signal.input.id);
                } else if (signal.type === 'DELETE_CHILD_DOCUMENT') {
                    await this._documentDeleted(drive, signal.input.id);
                }
            }

            // fetches the final state of the drive
            const driveDocument = await this.getDrive(drive);

            return {
                success: true,
                document: driveDocument,
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

    registerListener(
        driveId: string,
        input: CreateListenerInput
    ): Promise<Listener> {
        return this.storage.registerListener(driveId, input);
    }

    removeListener(listenerId: string): Promise<boolean> {
        return this.storage.removeListener(listenerId);
    }

    cleanAllListener(): Promise<boolean> {
        return this.storage.cleanAllListener();
    }

    async pushStrands(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        const results = await Promise.all(
            strands.map(strand => {
                const drive = strand.driveId;
                const documentId = strand.documentId;
                const scope = strand.scope;
                const branch = strand.branch;
                const operations: Operation[] = strand.operations.map(
                    operation => {
                        return {
                            ...operation,
                            scope,
                            branch,
                            index: operation.revision,
                            timestamp: new Date().toTimeString()
                        };
                    }
                );

                return this.addOperations(drive, documentId, operations);
            })
        );

        return results.map((result, i) => {
            const status: UpdateStatus = result.success
                ? UpdateStatus.SUCCESS
                : UpdateStatus.ERROR;

            return {
                driveId: strands[i]!.driveId,
                documentId: strands[i]!.documentId,
                scope: strands[i]!.scope,
                branch: strands[i]!.branch,
                status: status,
                revision: 0
            };
        });
    }
    getStrands(listenerId: string): Promise<StrandUpdate[]> {
        throw new Error('Method not implemented.');
    }
    getStrandsSince(listenerId: string, since: Date): Promise<StrandUpdate[]> {
        throw new Error('Method not implemented.');
    }
}

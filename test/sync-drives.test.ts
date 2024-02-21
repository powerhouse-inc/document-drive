import {
    DocumentDriveAction,
    Listener,
    ListenerFilter,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import {
    DocumentModel,
    Operation,
    OperationScope
} from 'document-model/document';
import * as DocumentModelLib from 'document-model/document-model';
import stringify from 'json-stringify-deterministic';
import { GraphQLQuery, HttpResponse, graphql } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
    DocumentDriveServer,
    ListenerRevision,
    PullResponderTransmitter,
    StrandUpdate,
    SyncStatus
} from '../src/server';
import { generateUUID } from '../src/utils';
import { buildOperation, buildOperations } from './utils';

describe('Document Drive Server interaction', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    function setupHandlers(server: DocumentDriveServer) {
        const handlers = [
            graphql.query('getDrive', async () => {
                const drive = await server.getDrive('1');
                return HttpResponse.json({
                    data: { drive: drive.state.global }
                });
            }),
            graphql.mutation<GraphQLQuery, { strands: StrandUpdate[] }>(
                'pushUpdates',
                async ({ variables }) => {
                    const strands = variables.strands;
                    let listenerRevisions: ListenerRevision[] = [];
                    if (strands.length) {
                        listenerRevisions = await Promise.all(
                            strands.map(async s => {
                                const operations =
                                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                                    s.operations?.map(o => ({
                                        ...o,
                                        input: JSON.parse(
                                            o.input as unknown as string
                                        ) as unknown,
                                        skip: o.skip ?? 0,
                                        scope: s.scope as OperationScope,
                                        branch: 'main',
                                        scopes: ['global', 'local']
                                    })) ?? [];

                                const result = await (!s.documentId
                                    ? server.addDriveOperations(
                                          s.driveId,
                                          operations as Operation<DocumentDriveAction>[]
                                      )
                                    : server.addOperations(
                                          s.driveId,
                                          s.documentId,
                                          operations
                                      ));

                                if (result.status !== 'SUCCESS')
                                    console.error(result.error);

                                const revision =
                                    result.document?.operations[s.scope]
                                        .slice()
                                        .pop()?.index ?? -1;
                                return {
                                    revision,
                                    branch: s.branch,
                                    documentId: s.documentId,
                                    driveId: s.driveId,
                                    scope: s.scope as OperationScope,
                                    status: result.status
                                };
                            })
                        );
                    }
                    return HttpResponse.json({
                        data: { pushUpdates: listenerRevisions }
                    });
                }
            ),
            graphql.mutation<GraphQLQuery, { filter: ListenerFilter }>(
                'registerPullResponderListener',
                async ({ variables }) => {
                    const driveId = '1';
                    const { filter } = variables;
                    const uuid = generateUUID();
                    const listener: Listener = {
                        block: false,
                        callInfo: {
                            data: '',
                            name: 'PullResponder',
                            transmitterType: 'PullResponder'
                        },
                        filter: {
                            branch: filter.branch ?? [],
                            documentId: filter.documentId ?? [],
                            documentType: filter.documentType ?? [],
                            scope: filter.scope ?? []
                        },
                        label: `Pullresponder #${uuid}`,
                        listenerId: uuid,
                        system: false
                    };
                    let drive = await server.getDrive(driveId);
                    drive = reducer(drive, actions.addListener({ listener }));
                    const operation = drive.operations.local.slice(-1);

                    await server.addDriveOperations(driveId, operation);
                    return HttpResponse.json({
                        data: {
                            registerPullResponderListener: {
                                listenerId: listener.listenerId
                            }
                        }
                    });
                }
            ),
            graphql.query<GraphQLQuery, { listenerId: string }>(
                'strands',
                async ({ variables }) => {
                    const transmitter = await server.getTransmitter(
                        '1',
                        variables.listenerId
                    );
                    if (!(transmitter instanceof PullResponderTransmitter)) {
                        throw new Error('Not a PullResponderTransmitter');
                    }
                    const strands = await transmitter.getStrands();
                    return HttpResponse.json({
                        data: {
                            system: {
                                sync: {
                                    strands: strands.map((e: StrandUpdate) => ({
                                        driveId: e.driveId,
                                        documentId: e.documentId,
                                        scope: e.scope,
                                        branch: e.branch,
                                        operations: e.operations.map(o => ({
                                            index: o.index,
                                            skip: o.skip,
                                            name: o.type,
                                            input: stringify(o.input),
                                            hash: o.hash,
                                            timestamp: o.timestamp,
                                            type: o.type
                                        }))
                                    }))
                                }
                            }
                        }
                    });
                }
            ),
            graphql.mutation<
                GraphQLQuery,
                {
                    listenerId: string;
                    revisions: ListenerRevision[];
                }
            >('acknowledge', async ({ variables }) => {
                let success = false;
                try {
                    const { listenerId, revisions } = variables;
                    const transmitter = await server.getTransmitter(
                        '1',
                        listenerId
                    );
                    if (
                        !transmitter ||
                        !(transmitter instanceof PullResponderTransmitter)
                    ) {
                        throw new Error(
                            `Transmitter with id ${listenerId} not found`
                        );
                    }
                    success = await transmitter.processAcknowledge(
                        '1',
                        listenerId,
                        revisions
                    );
                } catch (e) {
                    console.error(e);
                    success = false;
                }
                return HttpResponse.json({
                    data: { acknowledge: success }
                });
            })
        ];

        const mswServer = setupServer(...handlers);
        mswServer.listen({ onUnhandledRequest: 'error' });
        return mswServer;
    }

    beforeEach(() => {
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function createRemoteDrive() {
        const remoteServer = new DocumentDriveServer(documentModels);
        await remoteServer.initialize();

        const mswServer = setupHandlers(remoteServer);

        await remoteServer.addDrive({
            global: { id: '1', name: 'name', icon: 'icon', slug: 'slug' },
            local: {
                availableOffline: false,
                sharingType: 'PUBLIC',
                listeners: [],
                triggers: []
            }
        });
        return { remoteServer, mswServer } as const;
    }

    it('should create remote drive', async ({ expect }) => {
        const { mswServer } = await createRemoteDrive();

        const connectServer = new DocumentDriveServer(documentModels);
        await connectServer.addRemoteDrive('http://test', {
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: []
        });
        const drive = await connectServer.getDrive('1');

        expect(drive.state.global).toStrictEqual({
            id: '1',
            name: 'name',
            icon: 'icon',
            slug: 'slug',
            nodes: []
        });

        expect(drive.state.local).toStrictEqual({
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: [
                {
                    id: expect.any(String) as string,
                    type: 'PullResponder',
                    data: {
                        interval: '',
                        listenerId: expect.any(String) as string,
                        url: 'http://test'
                    }
                }
            ]
        });

        mswServer.close();
    });

    it('should synchronize drive operations', async ({ expect }) => {
        const { remoteServer, mswServer } = await createRemoteDrive();

        const connectServer = new DocumentDriveServer(documentModels);

        await connectServer.addRemoteDrive('http://test', {
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: []
        });

        let connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.operations.global.length).toBe(0);

        const remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.addFolder({ id: '1', name: 'test' })
            )
        );

        await new Promise<SyncStatus>(resolve =>
            connectServer.on(
                'syncStatus',
                (_, status) => status === 'SUCCESS' && resolve(status)
            )
        );

        connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.operations.global.length).toBe(1);
        expect(connectDrive.state.global.nodes).toStrictEqual([
            {
                id: '1',
                kind: 'folder',
                name: 'test',
                parentFolder: null
            }
        ]);

        mswServer.close();
    });

    it('should synchronize document operations', async ({ expect }) => {
        const { remoteServer, mswServer } = await createRemoteDrive();

        const connectServer = new DocumentDriveServer(documentModels);

        await connectServer.addRemoteDrive('http://test', {
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: []
        });

        let connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.operations.global.length).toBe(0);

        const remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.addFile({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            )
        );
        const remoteDocument = await remoteServer.getDocument('1', '1');
        await remoteServer.addOperation(
            '1',
            '1',
            buildOperation(
                DocumentModelLib.reducer,
                remoteDocument,
                DocumentModelLib.actions.setModelName({ name: 'test' })
            )
        );

        await vi.waitFor(async () => {
            const connectDocument = (await connectServer.getDocument(
                '1',
                '1'
            )) as DocumentModelLib.DocumentModelDocument;
            expect(connectDocument.operations.global.length).toBe(1);
        });

        connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.operations.global.length).toBe(1);
        expect(connectDrive.state.global.nodes).toStrictEqual([
            {
                id: '1',
                kind: 'file',
                name: 'test',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local'],
                parentFolder: null,
                synchronizationUnits: [
                    {
                        branch: 'main',
                        scope: 'global',
                        syncId: '1'
                    },
                    {
                        branch: 'main',
                        scope: 'local',
                        syncId: '2'
                    }
                ]
            }
        ]);

        const connectDocument = (await connectServer.getDocument(
            '1',
            '1'
        )) as DocumentModelLib.DocumentModelDocument;
        expect(connectDocument.state.global.name).toBe('test');

        mswServer.close();
    });

    it('should handle strand with deleted file', async ({ expect }) => {
        const { remoteServer, mswServer } = await createRemoteDrive();

        let remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperations(
            '1',
            buildOperations(reducer, remoteDrive, [
                actions.addFolder({ id: 'folder', name: 'new folder' }),
                actions.addFile({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            ])
        );
        const remoteDocument = await remoteServer.getDocument('1', '1');
        await remoteServer.addOperation(
            '1',
            '1',
            buildOperation(
                DocumentModelLib.reducer,
                remoteDocument,
                DocumentModelLib.actions.setModelName({ name: 'test' })
            )
        );

        remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.deleteNode({ id: '1' })
            )
        );

        const connectServer = new DocumentDriveServer(documentModels);

        await connectServer.addRemoteDrive('http://test', {
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: []
        });

        let connectDrive = await connectServer.getDrive('1');

        await vi.waitFor(async () => {
            const connectDocument = await connectServer.getDrive('1');
            expect(connectDocument.operations.global.length).toBe(3);
        });

        connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.state.global.nodes).toStrictEqual([
            {
                id: 'folder',
                kind: 'folder',
                name: 'new folder',
                parentFolder: null
            }
        ]);

        mswServer.close();
    });

    it('should handle deleted file after sync', async ({ expect }) => {
        const { remoteServer, mswServer } = await createRemoteDrive();

        let remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperations(
            '1',
            buildOperations(reducer, remoteDrive, [
                actions.addFolder({ id: 'folder', name: 'new folder' }),
                actions.addFile({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            ])
        );
        let remoteDocument = await remoteServer.getDocument('1', '1');
        await remoteServer.addOperation(
            '1',
            '1',
            buildOperation(
                DocumentModelLib.reducer,
                remoteDocument,
                DocumentModelLib.actions.setModelName({ name: 'test' })
            )
        );

        const connectServer = new DocumentDriveServer(documentModels);

        await connectServer.addRemoteDrive('http://test', {
            availableOffline: true,
            sharingType: 'public',
            listeners: [],
            triggers: []
        });

        let connectDrive = await connectServer.getDrive('1');

        await vi.waitFor(async () => {
            const connectDocument = await connectServer.getDrive('1');
            expect(connectDocument.operations.global.length).toBe(2);
        });

        connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.state.global.nodes).toStrictEqual([
            {
                id: 'folder',
                kind: 'folder',
                name: 'new folder',
                parentFolder: null
            },
            {
                id: '1',
                name: 'test',
                documentType: 'powerhouse/document-model',
                kind: 'file',
                parentFolder: null,
                scopes: ['global', 'local'],
                synchronizationUnits: [
                    {
                        branch: 'main',
                        scope: 'global',
                        syncId: '1'
                    },
                    {
                        branch: 'main',
                        scope: 'local',
                        syncId: '2'
                    }
                ]
            }
        ]);

        remoteDocument = await remoteServer.getDocument('1', '1');
        await remoteServer.addOperation(
            '1',
            '1',
            buildOperation(
                DocumentModelLib.reducer,
                remoteDocument,
                DocumentModelLib.actions.setModelName({ name: 'test 2' })
            )
        );

        remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.deleteNode({ id: '1' })
            )
        );

        vi.advanceTimersToNextTimer();

        await vi.waitFor(async () => {
            const connectDocument = await connectServer.getDrive('1');
            expect(connectDocument.operations.global.length).toBe(3);
        });

        connectDrive = await connectServer.getDrive('1');
        expect(connectDrive.state.global.nodes).toStrictEqual([
            {
                id: 'folder',
                kind: 'folder',
                name: 'new folder',
                parentFolder: null
            }
        ]);

        mswServer.close();
    });

    it('should filter strands', async ({ expect }) => {
        const { remoteServer, mswServer } = await createRemoteDrive();
        let remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperations(
            '1',
            buildOperations(reducer, remoteDrive, [
                actions.addFolder({ id: 'folder', name: 'new folder' }),
                actions.addFile({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            ])
        );
        const remoteDocument = await remoteServer.getDocument('1', '1');
        await remoteServer.addOperation(
            '1',
            '1',
            buildOperation(
                DocumentModelLib.reducer,
                remoteDocument,
                DocumentModelLib.actions.setModelName({ name: 'test' })
            )
        );

        remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.addListener({
                    listener: {
                        block: false,
                        callInfo: {
                            data: '',
                            name: 'PullResponder',
                            transmitterType: 'PullResponder'
                        },
                        filter: {
                            branch: ['*'],
                            documentId: ['*'],
                            documentType: ['*'],
                            scope: ['*']
                        },
                        label: `Pullresponder #3`,
                        listenerId: 'all',
                        system: false
                    }
                })
            )
        );
        remoteDrive = await remoteServer.getDrive('1');
        await remoteServer.addDriveOperation(
            '1',
            buildOperation(
                reducer,
                remoteDrive,
                actions.addListener({
                    listener: {
                        block: false,
                        callInfo: {
                            data: '',
                            name: 'PullResponder',
                            transmitterType: 'PullResponder'
                        },
                        filter: {
                            branch: ['*'],
                            documentId: ['*'],
                            documentType: ['powerhouse/document-model'],
                            scope: ['*']
                        },
                        label: `Pullresponder #3`,
                        listenerId: 'documentModel',
                        system: false
                    }
                })
            )
        );

        const transmitterAll = (await remoteServer.getTransmitter(
            '1',
            'all'
        )) as PullResponderTransmitter;
        const strandsAll = await transmitterAll.getStrands();
        expect(strandsAll.length).toBe(2);

        const transmitterDocumentModel = (await remoteServer.getTransmitter(
            '1',
            'documentModel'
        )) as PullResponderTransmitter;
        const strandsDocumentModel =
            await transmitterDocumentModel.getStrands();
        expect(strandsDocumentModel.length).toBe(1);
    });
});

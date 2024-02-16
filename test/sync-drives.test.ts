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
import { module as DocumentModelLib } from 'document-model/document-model';
import stringify from 'json-stringify-deterministic';
import { GraphQLQuery, HttpResponse, graphql } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
    DocumentDriveServer,
    ListenerRevision,
    PullResponderTransmitter,
    StrandUpdate
} from '../src/server';
import { generateUUID } from '../src/utils';

describe('Document Drive Server with %s', () => {
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
                    const transmitter = server.getTransmitter(
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
                    data: { success }
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

    it('should add pull trigger from remote drive', async ({ expect }) => {
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
});

import { PrismaClient } from '@prisma/client';
import {
    DocumentDriveAction,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel, Operation } from 'document-model/document';
import {
    actions as DocumentModelActions,
    DocumentModelDocument,
    module as DocumentModelLib
} from 'document-model/document-model';
import { HttpResponse, graphql, http } from 'msw';
import { setupServer } from 'msw/node';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    vi
} from 'vitest';

import stringify from 'json-stringify-deterministic';
import {
    DocumentDriveServer,
    ListenerRevision,
    StrandUpdateGraphQL,
    SyncStatus,
    UpdateStatus
} from '../src/server';
import { MemoryStorage } from '../src/storage/memory';

describe('Document Drive Server with %s', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    const prismaClient = new PrismaClient();
    const storageLayer = new MemoryStorage();

    const strands: StrandUpdateGraphQL[] = [
        {
            driveId: '1',
            documentId: '',
            scope: 'global',
            branch: 'main',
            operations: [
                {
                    timestamp: '2024-01-24T18:57:33.899Z',
                    index: 0,
                    skip: 0,
                    type: 'ADD_FILE',
                    input: stringify({
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model',
                        scopes: ['global', 'local']
                    }),
                    hash: 'nQBsTlP2MNb+FDBAzOw3svwyHvg='
                }
            ]
        },
        {
            driveId: '1',
            documentId: '1.1',
            scope: 'global',
            branch: 'main',
            operations: [
                {
                    timestamp: '2024-01-24T18:57:33.899Z',
                    index: 0,
                    skip: 0,
                    type: 'SET_NAME',
                    input: stringify('test'),
                    hash: 'Fd20qtObIUDJwJHse6VqFK8ObWY='
                }
            ]
        }
    ];

    const revisions: ListenerRevision[] = [
        {
            branch: 'main',
            documentId: '1.1',
            driveId: '1',
            revision: 0,
            scope: 'global',
            status: 'SUCCESS' as UpdateStatus
        }
        // ...
    ];

    const restHandlers = [
        http.get('https://rest-endpoint.example/path/to/posts', () => {
            return HttpResponse.json(revisions);
        })
    ];

    const graphqlHandlers = [
        graphql.query('getDrive', () => {
            return HttpResponse.json({
                data: {
                    drive: { id: '1', name: 'name', icon: 'icon', slug: 'slug' }
                }
            });
        }),
        graphql.mutation('pushUpdates', () => {
            return HttpResponse.json({
                data: { pushUpdates: revisions }
            });
        }),
        graphql.mutation('registerPullResponderListener', () => {
            return HttpResponse.json({
                data: {
                    registerPullResponderListener: { listenerId: 'listener-1' }
                }
            });
        }),
        graphql.query('strands', () => {
            return HttpResponse.json({
                data: { system: { sync: { strands } } }
            });
        }),
        graphql.mutation('acknowledge', () => {
            return HttpResponse.json({
                data: { success: true }
            });
        })
    ];

    const mswServer = setupServer(...restHandlers, ...graphqlHandlers);

    beforeEach(async () => {
        await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
        mswServer.resetHandlers();
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(async () => {
        vi.useRealTimers();
    });

    beforeAll(() => {
        mswServer.listen({ onUnhandledRequest: 'error' });
    });

    afterAll(() => mswServer.close());

    it('should add pull trigger from remote drive', async ({ expect }) => {
        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();
        await server.addRemoteDrive('http://switchboard.powerhouse.xyz/1', {
            availableOffline: true,
            sharingType: 'PUBLIC',
            listeners: [],
            triggers: [],
            pullFilter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global', 'local']
            },
            pullInterval: 5000
        });
        const drive = await server.getDrive('1');

        expect(drive.state.global).toStrictEqual({
            id: '1',
            name: 'name',
            icon: 'icon',
            slug: 'slug',
            nodes: []
        });

        expect(drive.state.local).toStrictEqual({
            availableOffline: true,
            sharingType: 'PUBLIC',
            listeners: [],
            triggers: [
                {
                    id: expect.any(String),
                    type: 'PullResponder',
                    data: {
                        interval: '5000',
                        listenerId: 'listener-1',
                        url: 'http://switchboard.powerhouse.xyz/1'
                    }
                }
            ]
        });
    });

    it('should push to switchboard if remoteDriveUrl is set', async ({
        expect
    }) => {
        mswServer.use(
            graphql.mutation('pushUpdates', () => {
                return HttpResponse.json({
                    data: {
                        pushUpdates: [
                            {
                                branch: 'main',
                                documentId: '',
                                driveId: '1',
                                revision: 0,
                                scope: 'global',
                                status: 'SUCCESS' as UpdateStatus
                            }
                        ]
                    }
                });
            })
        );

        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();
        await server.addDrive({
            global: { id: '1', name: 'name', icon: 'icon', slug: 'slug' },
            local: {
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: 'http://switchboard.powerhouse.xyz/1',
                            name: 'switchboard-push',
                            transmitterType: 'SwitchboardPush'
                        },
                        filter: {
                            branch: ['main'],
                            documentId: ['*'],
                            documentType: ['*'],
                            scope: ['global']
                        },
                        label: 'Switchboard Sync',
                        listenerId: '1',
                        system: true
                    }
                ],
                triggers: [],
                availableOffline: false,
                sharingType: 'PUBLIC'
            }
        });

        let drive = await server.getDrive('1');

        // adds file
        const addFileRequest = new Promise<Request>(resolve => {
            function listener(result: { request: Request }) {
                resolve(result.request);
                mswServer.events.removeListener('request:start', listener);
            }
            mswServer.events.on('request:start', listener);
        });
        drive = reducer(
            drive,
            actions.addFile({
                id: '1.1',
                name: 'document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            })
        );
        await server.addDriveOperation('1', drive.operations.global[0]!);
        expect(server.getSyncStatus('1')).toBe('SYNCING');
        const waitSync = new Promise(resolve =>
            server.on(
                'syncStatus',
                (drive, status) => status === 'SUCCESS' && resolve(status)
            )
        );
        const status = await waitSync;
        expect(status).toBe('SUCCESS');
        const addFileBody = await (await addFileRequest).json();
        expect(addFileBody).toEqual(
            expect.objectContaining({
                operationName: 'pushUpdates',
                query: expect.stringContaining('mutation pushUpdates'),
                variables: {
                    strands: [
                        {
                            branch: 'main',
                            documentId: '',
                            driveId: '1',
                            operations: [
                                {
                                    hash: 'nQBsTlP2MNb+FDBAzOw3svwyHvg=',
                                    index: 0,
                                    input: '{"documentType":"powerhouse/document-model","id":"1.1","name":"document 1","scopes":["global","local"]}',
                                    skip: 0,
                                    timestamp: '2024-01-01T00:00:00.000Z',
                                    type: 'ADD_FILE'
                                }
                            ],
                            scope: 'global'
                        }
                    ]
                }
            })
        );
        expect(addFileBody.query.replace(/\s+/g, ' ').trim()).toStrictEqual(
            `mutation pushUpdates($strands: [InputStrandUpdate!]) {
                pushUpdates(strands: $strands) {
                    driveId
                    documentId
                    scope
                    branch
                    status
                    revision
                }
            }
        `
                .replace(/\s+/g, ' ')
                .trim()
        );

        let document = (await server.getDocument(
            '1',
            '1.1'
        )) as DocumentModelDocument;
        document = DocumentModelLib.reducer(
            document,
            DocumentModelActions.setName('Test')
        );

        const setNameRequest = new Promise<Request>(resolve => {
            function listener(result: { request: Request }) {
                resolve(result.request);
                mswServer.events.removeListener('request:start', listener);
            }
            mswServer.events.on('request:start', listener);
        });

        const operation = document.operations.global[0]!;
        const result = await server.addOperation('1', '1.1', operation);
        expect(result.status).toBe('SUCCESS');
        expect(server.getSyncStatus('1')).toBe('SYNCING');

        const setNameBody = await (await setNameRequest).json();
        expect(setNameBody).toEqual(
            expect.objectContaining({
                operationName: 'pushUpdates',
                query: expect.stringContaining('mutation pushUpdates'),
                variables: {
                    strands: [
                        {
                            branch: 'main',
                            documentId: '1.1',
                            driveId: '1',
                            operations: [
                                {
                                    timestamp: '2024-01-01T00:00:00.000Z',
                                    hash: 'Fd20qtObIUDJwJHse6VqFK8ObWY=',
                                    input: '"Test"',
                                    type: 'SET_NAME',
                                    index: 0,
                                    skip: 0
                                }
                            ],
                            scope: 'global'
                        }
                    ]
                }
            })
        );
    });

    it('should pull from switchboard if remoteDriveUrl is set', async ({
        expect
    }) => {
        const ackRequestPromise = new Promise<JSON>(resolve => {
            mswServer.events.on('request:end', async ({ request }) => {
                void request.json().then(body => {
                    if (body.operationName === 'acknowledge') {
                        resolve(body);
                    }
                });
            });
        });

        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();

        const statusEvents: SyncStatus[] = [];
        server.on('syncStatus', (driveId, status) => {
            statusEvents.push(status);
        });

        await server.addRemoteDrive('http://switchboard.powerhouse.xyz/1', {
            availableOffline: true,
            sharingType: 'PUBLIC',
            triggers: [],
            listeners: [],
            pullFilter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global', 'local']
            }
        });

        vi.advanceTimersToNextTimer();

        await new Promise(resolve => server.on('strandUpdate', resolve));

        const drive = await server.getDrive('1');

        expect(drive.operations.global[0]).toMatchObject({
            index: 0,
            skip: 0,
            type: 'ADD_FILE',
            scope: 'global',
            hash: 'nQBsTlP2MNb+FDBAzOw3svwyHvg=',
            timestamp: expect.stringMatching(
                /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
            ),
            input: {
                id: '1.1',
                name: 'document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            }
        });

        const ackRequest = await ackRequestPromise;
        expect(ackRequest).toEqual(
            expect.objectContaining({
                operationName: 'acknowledge',
                query: expect.stringContaining('mutation acknowledge'),
                variables: {
                    listenerId: 'listener-1',
                    revisions: [
                        {
                            branch: 'main',
                            documentId: '',
                            driveId: '1',
                            revision: 0,
                            scope: 'global',
                            status: 'SUCCESS'
                        },
                        {
                            branch: 'main',
                            documentId: '1.1',
                            driveId: '1',
                            revision: 0,
                            scope: 'global',
                            status: 'SUCCESS'
                        }
                    ]
                }
            })
        );

        expect(statusEvents).toStrictEqual([
            'SYNCING',
            'SYNCING',
            'SUCCESS',
            'SYNCING',
            'SUCCESS',
            'SUCCESS',
            'SYNCING',
            'SUCCESS',
            'SUCCESS'
        ]);
    });

    it('should detect conflict when adding operation with existing index', async ({
        expect
    }) => {
        const server = new DocumentDriveServer(documentModels);
        await server.initialize();
        await server.addRemoteDrive('http://switchboard.powerhouse.xyz/1', {
            availableOffline: true,
            sharingType: 'PUBLIC',
            triggers: [],
            listeners: [],
            pullFilter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global', 'local']
            }
        });

        vi.advanceTimersToNextTimer();

        await new Promise(resolve => server.on('strandUpdate', resolve));

        const operation: Operation<DocumentDriveAction> = {
            index: 0,
            skip: 0,
            type: 'ADD_FILE',
            scope: 'global',
            hash: 'nf7WF7HnxrfpF6il8qQRAH9URgM=',
            timestamp: '2024-01-01T00:00:00.000Z',
            input: {
                id: '1.1',
                name: 'local document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            }
        };

        const result = await server.addDriveOperation('1', operation);
        expect(result.status).toBe('CONFLICT');
        expect(result.error?.message).toBe('Conflicting operation on index 0');
        expect(result.error?.cause).toStrictEqual({
            existingOperation: {
                branch: 'main',
                index: 0,
                skip: 0,
                type: 'ADD_FILE',
                scope: 'global',
                hash: 'nQBsTlP2MNb+FDBAzOw3svwyHvg=',
                timestamp: expect.stringMatching(
                    /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
                ),
                input: {
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                }
            },
            newOperation: operation
        });
    });

    it('should detect conflict when pulling operation with existing index', async ({
        expect
    }) => {
        mswServer.use(
            graphql.query('strands', () => {
                return HttpResponse.json({
                    data: { system: { sync: { strands: [] } } }
                });
            })
        );

        const server = new DocumentDriveServer(documentModels);
        await server.initialize();
        await server.addRemoteDrive('http://switchboard.powerhouse.xyz/1', {
            availableOffline: true,
            sharingType: 'PUBLIC',
            triggers: [],
            listeners: [],
            pullFilter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global', 'local']
            }
        });

        const operation: Operation<DocumentDriveAction> = {
            index: 0,
            skip: 0,
            type: 'ADD_FILE',
            scope: 'global',
            hash: 'nf7WF7HnxrfpF6il8qQRAH9URgM=',
            timestamp: '2024-01-01T00:00:00.000Z',
            input: {
                id: '1.1',
                name: 'local document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            }
        };

        const result = await server.addDriveOperation('1', operation);
        expect(result.status).toBe('SUCCESS');
        expect(server.getSyncStatus('1')).toBe('SYNCING');

        mswServer.use(
            graphql.query('strands', () => {
                return HttpResponse.json({
                    data: { system: { sync: { strands } } }
                });
            })
        );

        vi.advanceTimersToNextTimer();

        await new Promise(resolve => server.on('syncStatus', resolve));

        expect(server.getSyncStatus('1')).toBe('CONFLICT');
    });

    it('should detect conflict when pushing operation with existing index', async ({
        expect
    }) => {
        mswServer.use(
            graphql.query('strands', () => {
                return HttpResponse.json({
                    data: { system: { sync: { strands: [] } } }
                });
            }),
            graphql.mutation('pushUpdates', () => {
                return HttpResponse.json({
                    data: {
                        pushUpdates: [
                            {
                                branch: 'main',
                                documentId: '',
                                driveId: '1',
                                revision: 0,
                                scope: 'global',
                                status: 'CONFLICT'
                            }
                        ]
                    }
                });
            })
        );

        const server = new DocumentDriveServer(documentModels);
        await server.initialize();
        await server.addRemoteDrive('http://switchboard.powerhouse.xyz/1', {
            availableOffline: true,
            sharingType: 'PUBLIC',
            triggers: [],
            listeners: [
                {
                    block: true,
                    callInfo: {
                        data: 'http://switchboard.powerhouse.xyz/1',
                        name: 'switchboard-push',
                        transmitterType: 'SwitchboardPush'
                    },
                    filter: {
                        branch: ['main'],
                        documentId: ['*'],
                        documentType: ['*'],
                        scope: ['global', 'local']
                    },
                    label: 'Switchboard Sync',
                    listenerId: '1',
                    system: true
                }
            ],

            pullFilter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global', 'local']
            }
        });

        const operation: Operation<DocumentDriveAction> = {
            index: 0,
            skip: 0,
            type: 'ADD_FILE',
            scope: 'global',
            hash: 'nf7WF7HnxrfpF6il8qQRAH9URgM=',
            timestamp: '2024-01-01T00:00:00.000Z',
            input: {
                id: '1.1',
                name: 'local document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            }
        };

        await server.addDriveOperation('1', operation);

        const status = await new Promise(resolve => {
            server.on('syncStatus', (_driveId, status) => resolve(status));
            vi.advanceTimersToNextTimer();
        });
        expect(status).toBe('CONFLICT');

        const drive = await server.getDrive('1');
        expect(drive.operations.global.length).toBe(1);
        // expect(server.getSyncStatus('1')).toBe('');
    });
});

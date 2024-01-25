import { PrismaClient } from '@prisma/client';
import { actions, reducer } from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
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

import { PrismaStorage } from '../src';
import {
    DocumentDriveServer,
    ListenerRevision,
    StrandUpdate,
    UpdateStatus
} from '../src/server';

describe('Document Drive Server with %s', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    const prismaClient = new PrismaClient();
    const storageLayer = new PrismaStorage(prismaClient);

    const strands: StrandUpdate[] = [
        {
            driveId: '1',
            documentId: '',
            scope: 'global',
            branch: 'main',
            operations: [
                {
                    committed: '2024-01-24T18:57:33.899Z',
                    revision: 0,
                    skip: 0,
                    operation: 'ADD_FILE',
                    input: {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model',
                        scopes: ['global', 'local']
                    },
                    hash: 'ReImxJnUT6Gt2yRRq0q3PzPY2s4='
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
        graphql.mutation('pushUpdates', () => {
            return HttpResponse.json({
                data: { revisions }
            });
        }),
        graphql.mutation('registerPullResponderListener', () => {
            return HttpResponse.json({
                data: { listenerId: '1' }
            });
        }),
        graphql.query('strands', () => {
            return HttpResponse.json({
                data: { strands }
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

    it.only('should push to switchboard if remoteDriveUrl is set', async ({
        expect
    }) => {
        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();
        await server.addDrive({
            global: {
                id: '1',
                name: 'name',
                icon: 'icon',
                remoteUrl: 'http://switchboard.powerhouse.xyz'
            },
            local: {
                availableOffline: false,
                sharingType: 'public',
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: 'http://switchboard.powerhouse.xyz/1/graphql',
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
                ]
            }
        });
        let drive = await server.getDrive('1');

        // adds file
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

        let document = (await server.getDocument(
            '1',
            '1.1'
        )) as DocumentModelDocument;
        document = DocumentModelLib.reducer(
            document,
            DocumentModelActions.setName('Test')
        );

        const pushRequest = new Promise<Request>(resolve => {
            mswServer.events.on('request:start', ({ request }) => {
                resolve(request);
            });
        });

        const operation = document.operations.global[0]!;
        const result = await server.addOperation('1', '1.1', operation);
        expect(result.success).toBe(true);

        const request = await pushRequest;
        expect(request.url).toStrictEqual(
            'http://switchboard.powerhouse.xyz/1/graphql'
        );
        const body = await request.json();
        expect(body).toEqual(
            expect.objectContaining({
                operationName: 'pushUpdates',
                variables: {
                    strands: [
                        {
                            branch: 'main',
                            documentId: '1.1',
                            documentType: 'powerhouse/document-model',
                            driveId: '1',
                            lastUpdated: '2024-01-01T00:00:00.000Z',
                            listenerRev: -1,
                            operations: [
                                {
                                    committed: '2024-01-01T00:00:00.000Z',
                                    hash: 'Fd20qtObIUDJwJHse6VqFK8ObWY=',
                                    input: 'Test',
                                    operation: 'SET_NAME',
                                    revision: 0,
                                    skip: 0
                                }
                            ],
                            revision: 0,
                            scope: 'global',
                            syncId: '1',
                            syncRev: 0
                        },
                        {
                            branch: 'main',
                            documentId: '1.1',
                            documentType: 'powerhouse/document-model',
                            driveId: '1',
                            lastUpdated: '2024-01-01T00:00:00.000Z',
                            listenerRev: -1,
                            operations: [],
                            revision: 0,
                            scope: 'local',
                            syncId: '2',
                            syncRev: 0
                        }
                    ]
                }
            })
        );
        expect(body.query.replace(/\s+/g, ' ').trim()).toStrictEqual(
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
    });

    it.only('should pull from switchboard if remoteDriveUrl is set', async ({
        expect
    }) => {
        // Connect document drive server
        mswServer.events.on('request:start', ({ request, requestId }) => {
            console.log('Outgoing request:', request.method, request.url);
        });
        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();
        await server.addDrive({
            global: {
                id: '1',
                name: 'name',
                icon: 'icon',
                remoteUrl: 'http://switchboard.powerhouse.xyz'
            },
            local: {
                availableOffline: true,
                sharingType: 'public',
                listeners: []
            }
        });

        vi.advanceTimersToNextTimer();

        const drive = await vi.waitFor(
            async () => {
                const drive = await server.getDrive('1');
                expect(drive.operations.global.length).toBeTruthy();
                return drive;
            },
            {
                timeout: 500,
                interval: 20
            }
        );

        expect(drive.operations.global[0]).toMatchObject({
            index: 0,
            skip: 0,
            type: 'ADD_FILE',
            scope: 'global',
            hash: 'ReImxJnUT6Gt2yRRq0q3PzPY2s4=',
            timestamp: '2024-01-24T18:57:33.899Z',
            input: {
                id: '1.1',
                name: 'document 1',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            }
        });
    });
});

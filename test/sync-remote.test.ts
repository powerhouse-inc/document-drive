import { PrismaClient } from '@prisma/client';
import { actions, reducer } from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    actions as DocumentModelActions,
    DocumentModelDocument,
    module as DocumentModelLib
} from 'document-model/document-model';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { PrismaStorage } from '../src';
import { DocumentDriveServer } from '../src/server';

describe('Document Drive Server with %s', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    const prismaClient = new PrismaClient();
    const storageLayer = new PrismaStorage(prismaClient);

    beforeEach(async () => {
        await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(async () => {
        vi.useRealTimers();
    });

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
                remoteUrl: 'http://localhost:3001/graphql/'
            },
            local: {
                availableOffline: false,
                sharingType: 'public',
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: 'http://localhost:3001/graphql/',
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
        const addFileResult = await server.addDriveOperation(
            '1',
            drive.operations.global[0]!
        );
        expect(addFileResult.error).toBeUndefined();
        expect(addFileResult.success).toBe(true);

        let document = (await server.getDocument(
            '1',
            '1.1'
        )) as DocumentModelDocument;
        document = DocumentModelLib.reducer(
            document,
            DocumentModelActions.setAuthorName({ authorName: 'test' })
        );

        // const pushRequest = new Promise<Request>(resolve => {
        //     mswServer.events.on('request:start', ({ request }) => {
        //         resolve(request);
        //     });
        // });

        const operation = document.operations.global[0]!;
        const result = await server.addOperation('1', '1.1', operation);
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);

        //     const request = await pushRequest;
        //     expect(request.url).toStrictEqual(
        //         'http://switchboard.powerhouse.xyz/1/graphql'
        //     );
        //     const body = await request.json();
        //     expect(body).toEqual(
        //         expect.objectContaining({
        //             operationName: 'pushUpdates',
        //             variables: {
        //                 strands: [
        //                     {
        //                         branch: 'main',
        //                         documentId: '1.1',
        //                         documentType: 'powerhouse/document-model',
        //                         driveId: '1',
        //                         lastUpdated: '2024-01-01T00:00:00.000Z',
        //                         operations: [
        //                             {
        //                                 committed: '2024-01-01T00:00:00.000Z',
        //                                 hash: 'Fd20qtObIUDJwJHse6VqFK8ObWY=',
        //                                 input: 'Test',
        //                                 operation: 'SET_NAME',
        //                                 revision: 0,
        //                                 skip: 0
        //                             }
        //                         ],
        //                         revision: 0,
        //                         scope: 'global'
        //                     },
        //                     {
        //                         branch: 'main',
        //                         documentId: '1.1',
        //                         documentType: 'powerhouse/document-model',
        //                         driveId: '1',
        //                         lastUpdated: '2024-01-01T00:00:00.000Z',
        //                         operations: [],
        //                         revision: 0,
        //                         scope: 'local'
        //                     }
        //                 ]
        //             }
        //         })
        //     );
        //     expect(body.query.replace(/\s+/g, ' ').trim()).toStrictEqual(
        //         `mutation pushUpdates($strands: [InputStrandUpdate!]) {
        //         pushUpdates(strands: $strands) {
        //             driveId
        //             documentId
        //             scope
        //             branch
        //             status
        //             revision
        //         }
        //     }
        // `
        //             .replace(/\s+/g, ' ')
        //             .trim()
        //     );
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

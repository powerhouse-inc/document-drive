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
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { PrismaStorage } from '../src';
import {
    DocumentDriveServer,
    ListenerRevision,
    UpdateStatus
} from '../src/server';

describe('Document Drive Server with %s', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    const prismaClient = new PrismaClient();
    const storageLayer = new PrismaStorage(prismaClient);

    const revisions: ListenerRevision[] = [
        {
            branch: 'main',
            documentId: '1',
            driveId: '1',
            revision: 1,
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
        })
    ];

    const mswServer = setupServer(...restHandlers, ...graphqlHandlers);

    afterEach(async () => {
        await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
    });

    beforeAll(() => {
        mswServer.listen({ onUnhandledRequest: 'error' });
    });

    afterAll(() => mswServer.close());

    afterEach(() => mswServer.resetHandlers());

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
                            data: '',
                            name: 'switchboard-push',
                            transmitterType: 'SwitchboardPush'
                        },
                        filter: {
                            branch: ['main'],
                            documentId: ['*'],
                            documentType: ['powerhouse/*'],
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

        const operation = document.operations.global[0]!;
        const result = await server.addOperation('1', '1.1', operation);
        expect(result.success).toBe(true);
    });

    it.only('should pull from switchboard if remoteDriveUrl is set', async ({
        expect
    }) => {
        // switchboard document drive server
        const server = new DocumentDriveServer(documentModels, storageLayer);
        await server.initialize();
        await server.addDrive({
            global: {
                id: '1',
                name: 'name',
                icon: 'icon',
                remoteUrl: ''
            },
            local: {
                availableOffline: false,
                sharingType: 'public',
                listeners: []
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
        const operation = document.operations.global[0]!;
        await server.addOperation('1', '1.1', operation);

        // Connect document drive server
        const connect = new DocumentDriveServer(documentModels, storageLayer);
        await connect.initialize();
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

        expect(result.success).toBe(true);
        expect(result.document?.state.local.listeners[0]?.listenerId).toBe('1');
    });
});

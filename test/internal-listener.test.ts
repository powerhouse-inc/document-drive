import { actions } from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import * as DocumentModelLib from 'document-model/document-model';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
    vitest
} from 'vitest';
import { DocumentDriveServer, IReceiver } from '../src';

describe('Internal Listener', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    async function buildServer(receiver: IReceiver) {
        const server = new DocumentDriveServer(documentModels);
        await server.initialize();

        await server.addDrive({
            global: {
                id: 'drive',
                name: 'Global Drive',
                icon: '',
                slug: 'global'
            },
            local: {
                availableOffline: false,
                listeners: [],
                sharingType: 'private',
                triggers: []
            }
        });
        await server.addInternalListener('drive', receiver, {
            block: true,
            filter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global']
            },
            label: 'Internal',
            listenerId: 'internal'
        });
        return server;
    }

    beforeEach(() => {
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should call transmit function of listener', async () => {
        const transmitFn = vitest.fn(() => Promise.resolve([]));

        const server = await buildServer({ transmit: transmitFn });
        await server.addDriveAction(
            'drive',
            actions.addFile({
                id: '1',
                name: 'test',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            })
        );

        await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(1));
        expect(transmitFn).toHaveBeenCalledWith([
            {
                branch: 'main',
                documentId: '',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'XsiPXaQJ0Lk4Y6CKyEkaFatdbLo=',
                        index: 0,
                        input: {
                            documentType: 'powerhouse/document-model',
                            id: '1',
                            name: 'test',
                            scopes: ['global', 'local']
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ADD_FILE'
                    }
                ],
                scope: 'global'
            }
        ]);

        await server.addAction(
            'drive',
            '1',
            DocumentModelLib.actions.setModelName({ name: 'test' })
        );

        await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(2));
        expect(transmitFn).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'XsiPXaQJ0Lk4Y6CKyEkaFatdbLo=',
                        index: 0,
                        input: {
                            documentType: 'powerhouse/document-model',
                            id: '1',
                            name: 'test',
                            scopes: ['global', 'local']
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ADD_FILE'
                    }
                ],
                scope: 'global'
            },
            {
                branch: 'main',
                documentId: '1',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'nWKpqR6ns0l8C/Khwrl+SyKy0sA=',
                        index: 0,
                        input: {
                            name: 'test'
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.100Z',
                        type: 'SET_MODEL_NAME'
                    }
                ],
                scope: 'global'
            }
        ]);
    });

    test('acknowledged strands should not be transmitted again', async () => {
        const receiver: IReceiver = {
            transmit: vi.fn(strands => {
                return Promise.resolve(
                    strands.map(({ operations, ...s }) => ({
                        ...s,
                        status: 'SUCCESS',
                        revision: operations[operations.length - 1]?.index ?? -1
                    }))
                );
            })
        };

        const server = await buildServer(receiver);
        await server.addDriveAction(
            'drive',
            actions.addFile({
                id: '1',
                name: 'test',
                documentType: 'powerhouse/document-model',
                scopes: ['global', 'local']
            })
        );

        await vi.waitFor(() => expect(receiver.transmit).toBeCalledTimes(1));
        expect(receiver.transmit).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'XsiPXaQJ0Lk4Y6CKyEkaFatdbLo=',
                        index: 0,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ADD_FILE',
                        input: {
                            id: '1',
                            name: 'test',
                            documentType: 'powerhouse/document-model',
                            scopes: ['global', 'local']
                        },
                        skip: 0
                    }
                ],
                scope: 'global'
            }
        ]);

        await server.addAction(
            'drive',
            '1',
            DocumentModelLib.actions.setModelName({ name: 'test' })
        );

        await vi.waitFor(() => expect(receiver.transmit).toBeCalledTimes(2));
        expect(receiver.transmit).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '1',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'nWKpqR6ns0l8C/Khwrl+SyKy0sA=',
                        index: 0,
                        timestamp: '2024-01-01T00:00:00.100Z',
                        type: 'SET_MODEL_NAME',
                        input: { name: 'test' },
                        skip: 0
                    }
                ],
                scope: 'global'
            }
        ]);

        await server.addAction(
            'drive',
            '1',
            DocumentModelLib.actions.setModelName({ name: 'test 2' })
        );
        await vi.waitFor(() => expect(receiver.transmit).toBeCalledTimes(3));

        expect(receiver.transmit).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '1',
                driveId: 'drive',
                operations: [
                    {
                        hash: 's7RBcer0JqjSGvNb12gqpeeJGRY=',
                        index: 1,
                        timestamp: '2024-01-01T00:00:00.200Z',
                        type: 'SET_MODEL_NAME',
                        input: { name: 'test 2' },
                        skip: 0
                    }
                ],
                scope: 'global'
            }
        ]);
    });
});

import { actions, reducer } from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    actions as DocumentModelActions,
    DocumentModelDocument,
    module as DocumentModelLib
} from 'document-model/document-model';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage/memory';

const SWITCHBOARD_URL =
    process.env['SWITCHBOARD_URL'] ?? 'http://localhost:3000/';

function buildSwitchboardUrl(endpoint: string) {
    return new URL(endpoint, SWITCHBOARD_URL).href;
}

describe.sequential('Document Drive Server with %s', async () => {
    const switchboardAvailable = await fetch(buildSwitchboardUrl('healthz'))
        .then(r => r.ok)
        .catch(() => false);

    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    const storageLayer = new MemoryStorage();

    beforeEach(async () => {
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(async () => {
        vi.useRealTimers();
    });

    const itAvailabe = switchboardAvailable ? it : it.skip;

    itAvailabe(
        'should push to remote switchboard if remoteDriveUrl is set',
        async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                storageLayer
            );
            await server.initialize();
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: '1'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    triggers: [],
                    listeners: [
                        {
                            block: true,
                            callInfo: {
                                data: buildSwitchboardUrl('1'),
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
            expect(addFileResult.status).toBe('SUCCESS');

            let document = (await server.getDocument(
                '1',
                '1.1'
            )) as DocumentModelDocument;
            document = DocumentModelLib.reducer(
                document,
                DocumentModelActions.setAuthorName({ authorName: 'test' })
            );

            const operation = document.operations.global[0]!;
            const result = await server.addOperation('1', '1.1', operation);
            expect(result.error).toBeUndefined();
            expect(result.status).toBe('SUCCESS');
        }
    );

    itAvailabe(
        'should pull from remote switchboard if remoteDriveUrl is set',
        async ({ expect }) => {
            // Connect document drive server
            const server = new DocumentDriveServer(
                documentModels,
                storageLayer
            );
            await server.initialize();
            await server.addRemoteDrive(buildSwitchboardUrl('1'), {
                availableOffline: true,
                sharingType: 'public',
                listeners: [],
                triggers: []
            });

            await vi.waitFor(
                async () => {
                    await server.getDrive('1');
                },
                {
                    timeout: 500,
                    interval: 20
                }
            );

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
                branch: 'main',
                hash: 'ASoU0JoMMmy5N6W00OywIiIKXdU=',
                timestamp: '2024-01-01T00:00:00.000Z',
                input: {
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                }
            });

            const document = await vi.waitFor(
                async () => {
                    const document = (await server.getDocument(
                        '1',
                        '1.1'
                    )) as DocumentModelDocument;
                    expect(document.operations.global.length).toBeTruthy();
                    return document;
                },
                {
                    timeout: 500,
                    interval: 20
                }
            );

            expect(document.state.global.author.name).toBe('test');
        }
    );
});

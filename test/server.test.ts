import {
    utils as DocumentDriveUtils,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
    utils as DocumentModelUtils
} from 'document-model/document-model';
import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, it } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage';

const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[];

const FileStorageDir = path.join(__dirname, './file-storage');

const storageLayers = [
    ['MemoryStorage', () => new MemoryStorage()]
    // ['FilesystemStorage', () => new FilesystemStorage(FileStorageDir)],
    // ['BrowserStorage', () => new BrowserStorage()]
] as const;

describe.each(storageLayers)(
    'Document Drive Server with %s',
    (storageName, buildStorage) => {
        afterEach(() => {
            if (storageName === 'FilesystemStorage') {
                return fs.rm(FileStorageDir, { recursive: true, force: true });
            }
        });

        it('adds drive to server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            const drive = await server.getDrive('1');
            expect(drive.state).toStrictEqual(
                DocumentDriveUtils.createState({
                    global: {
                        id: '1',
                        name: 'name',
                        icon: 'icon'
                    },
                    local: {
                        availableOffline: false,
                        sharingType: 'public'
                    }
                })
            );

            const drives = await server.getDrives();
            expect(drives).toStrictEqual(['1']);
        });

        it('adds file to server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');

            // performs ADD_FILE operation locally
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                })
            );

            // dispatches operation to server
            const operation = drive.operations.global[0]!;
            const operationResult = await server.addDriveOperation(
                '1',
                operation
            );
            expect(drive.state.global).toStrictEqual(
                operationResult.document?.state.global
            );
            expect(drive.state.global.nodes).toStrictEqual([
                {
                    documentType: 'powerhouse/document-model',
                    id: '1.1',
                    kind: 'file',
                    name: 'document 1',
                    parentFolder: null
                }
            ]);
        });

        it('creates new document of the correct document type when file is added to server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                })
            );
            const operation = drive.operations.global[0]!;

            await server.addDriveOperation('1', operation);

            const document = await server.getDocument('1', '1.1');
            expect(document.documentType).toBe('powerhouse/document-model');
            expect(document.state).toStrictEqual(
                DocumentModelUtils.createState()
            );

            const driveDocuments = await server.getDocuments('1');
            expect(driveDocuments).toStrictEqual(['1.1']);
        });

        it('deletes file from server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');

            // adds file
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                })
            );
            await server.addDriveOperation('1', drive.operations.global[0]!);

            // removes file
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );
            await server.addDriveOperation('1', drive.operations.global[1]!);

            const serverDrive = await server.getDrive('1');
            expect(serverDrive.state.global.nodes).toStrictEqual([]);
        });

        it('deletes document when file is removed from server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                })
            );
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );

            await server.addDriveOperations('1', drive.operations.global);

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);

            expect(server.getDocument('1', '1.1')).rejects.toThrowError(
                'Document with id 1.1 not found'
            );
        });

        it('deletes documents inside a folder when it is removed from a drive', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');

            drive = reducer(
                drive,
                actions.addFolder({
                    id: '1.1',
                    name: 'document 1'
                })
            );
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model',
                    parentFolder: '1.1'
                })
            );
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );

            await server.addDriveOperations('1', drive.operations.global);

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);

            expect(server.getDocument('1', '1.1')).rejects.toThrowError(
                'Document with id 1.1 not found'
            );
        });

        it('deletes drive from server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });

            await server.deleteDrive('1');

            const drives = await server.getDrives();
            expect(drives).toStrictEqual([]);
        });

        it('deletes documents when drive is deleted from server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });

            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                })
            );

            await server.addDriveOperation('1', drive.operations.global[0]!);
            await server.deleteDrive('1');

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);
        });

        it('renames drive', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.setDriveName({
                    name: 'new name'
                })
            );

            await server.addDriveOperation('1', drive.operations.global[0]!);

            drive = await server.getDrive('1');
            expect(drive.state.global.name).toBe('new name');
        });

        it('copies document when file is copied drive', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    remoteUrl: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public'
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.addFolder({
                    id: '1',
                    name: '1'
                })
            );
            drive = reducer(
                drive,
                actions.addFolder({
                    id: '2',
                    name: '2'
                })
            );
            drive = reducer(
                drive,
                actions.addFile({
                    id: '1.1',
                    name: '1.1',
                    documentType: 'powerhouse/document-model',
                    parentFolder: '1'
                })
            );
            drive = reducer(
                drive,
                actions.copyNode({
                    srcId: '1.1',
                    targetId: '2.1',
                    targetName: '2.2',
                    targetParentFolder: '2'
                })
            );
            await server.addDriveOperations('1', drive.operations.global);
            drive = await server.getDrive('1');
            const document = await server.getDocument('1', '1.1');
            const documentB = await server.getDocument('1', '2.1');
            expect(document).toStrictEqual(documentB);
        });
    }
);

import {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveState,
    utils as DocumentDriveUtils,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { Document, DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import { describe, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage/memory';
import { generateUUID } from '../src';

const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[];


describe("Document Drive Server queuing", () => {

    let CREATE_DRIVES = 10;
    let ADD_OPERATIONS_TO_DRIVE = 10;

    const createDrive = async (server: DocumentDriveServer) => {
        const driveState = await server.addDrive({
            global: {
                id: generateUUID(),
                name: 'name',
                icon: 'icon',
                slug: 'slug'
            },
            local: {
                availableOffline: false,
                sharingType: 'public',
                listeners: [],
                triggers: []
            }
        });

        const drive = await server.getDrive(driveState.state.global.id);
        return drive;
    }

    const addOperationsToDrive = async (server: DocumentDriveServer, drive: DocumentDriveDocument, queue = true) => {
        const promisses = [];
        for (let i = 0; i < ADD_OPERATIONS_TO_DRIVE; i++) {
            const id = generateUUID();
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id,
                        name: id,
                        documentType: 'powerhouse/budget-statement',
                    },
                    ['global', 'local'],
                )
            );
            promisses.push(queue ? server.queueDriveOperations(drive.state.global.id, drive.operations.global) : server.addDriveOperations(drive.state.global.id, drive.operations.global));
        }
        return Promise.all(promisses);
    }

    it("produces conflicts on addDriveOperations", async ({ expect }) => {
        const server = new DocumentDriveServer(
            documentModels,
            new MemoryStorage()
        );
        await server.initialize();
        const drives = await Promise.all(new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
            return createDrive(server);
        }));
        const driveResults = await Promise.all(drives.map((drive) => {
            expect(drive).toBeDefined();
            return addOperationsToDrive(server, drive!, false);
        }))
        expect(driveResults.flat().filter((f: any) => f.status === "CONFLICT").length).toBeGreaterThan(0);
    });

    it("produces no conflicts on queueDriveOperations", async ({ expect }) => {
        const server = new DocumentDriveServer(
            documentModels,
            new MemoryStorage()
        );
        await server.initialize();
        const drives = await Promise.all(new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
            return createDrive(server);
        }));
        const driveResults = await Promise.all(drives.map((drive) => {
            expect(drive).toBeDefined();
            return addOperationsToDrive(server, drive!);
        }))
        expect(driveResults.flat().filter((f: any) => f.status === "CONFLICT").length).toBe(0);
    });
});

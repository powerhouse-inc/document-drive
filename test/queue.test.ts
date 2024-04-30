import {
    actions,
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveState,
    utils as DocumentDriveUtils,
    reducer
} from 'document-model-libs/document-drive';
import * as BudgetStatement from 'document-model-libs/budget-statement';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { Document, DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import { describe, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage/memory';
import { generateUUID, IOperationResult } from '../src';
import { MemoryQueueManager } from '../src/queue/memory';
import { buildOperation, buildOperations } from './utils';

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

    it("orders strands correctly", async ({ expect }) => {
        const server = new DocumentDriveServer(
            documentModels,
            new MemoryStorage()
        );
        await server.initialize();
        let drive = await createDrive(server);
        const driveId = drive.state.global.id;
        const driveOperations = buildOperations(reducer, drive, [
            actions.addFolder({ id: "folder 1", name: "folder 1" }),
            actions.addFile({ id: "file 1", name: "file 1", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] })]
        );
        let budget = BudgetStatement.utils.createDocument();
        const budgetOperation = buildOperation(BudgetStatement.reducer, budget, BudgetStatement.actions.addAccount({
            address: '0x123'
        }));

        const results = await Promise.all([
            server.queueDriveOperations(driveId, [buildOperation(reducer, drive, actions.addFolder({ id: "folder 2", name: "folder 2" }))]),
            server.queueDriveOperations(driveId, driveOperations),
            server.queueOperations(driveId, "file 1", [budgetOperation])
        ]);

        const errors = results.flat().filter(r => !!(r as IOperationResult).error);
        if (errors.length) {
            errors.forEach(error => console.error(error));
        }
        expect(errors.length).toBe(0);

        drive = await server.getDrive(driveId);
        expect(drive.state.global.nodes).toStrictEqual([
            expect.objectContaining({ id: "folder 2", name: "folder 2" }),
            expect.objectContaining({ id: "folder 1", name: "folder 1" }),
            expect.objectContaining({ id: "file 1", name: "file 1", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] })
        ]);

        budget = await server.getDocument(driveId, "file 1") as BudgetStatement.BudgetStatementDocument;
        expect(budget.state.global.accounts).toStrictEqual([
            expect.objectContaining({ address: "0x123" }),
        ]);
    });

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

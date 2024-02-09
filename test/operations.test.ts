import {
    DocumentDriveAction,
    DocumentDriveDocument,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { BaseAction, DocumentModel, Operation } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { beforeEach } from 'node:test';
import { describe, expect, it } from 'vitest';
import { DocumentDriveServer } from '../src';

function buildOperation(
    document: DocumentDriveDocument,
    action: DocumentDriveAction | BaseAction,
    index?: number
): Operation<DocumentDriveAction | BaseAction> {
    const newDocument = reducer(document, action);
    const operation = newDocument.operations[action.scope].slice().pop()!;
    return { ...operation, index: index ?? operation.index };
}

function buildOperations(
    document: DocumentDriveDocument,
    actions: Array<DocumentDriveAction | BaseAction>
): Operation<DocumentDriveAction | BaseAction>[] {
    const operations: Operation<DocumentDriveAction | BaseAction>[] = [];
    for (const action of actions) {
        document = reducer(document, action);
        const operation = document.operations[action.scope].slice().pop()!;
        operations.push(operation);
    }
    return operations;
}

describe('Drive operations', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    let server = new DocumentDriveServer(documentModels);
    beforeEach(async () => {
        server = new DocumentDriveServer(documentModels);
        await server.initialize();
    });

    it('should be able to apply an operation to the drive', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        const result = await server.addDriveOperation(
            '1',
            buildOperation(drive, actions.addFolder({ id: '1', name: 'test' }))
        );
        expect(result.status).toBe('SUCCESS');
    });

    it('should reject invalid operation', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        await server.addDriveOperation(
            '1',
            buildOperation(drive, actions.addFolder({ id: '1', name: 'test' }))
        );

        const result = await server.addDriveOperation(
            '1',
            buildOperation(
                drive,
                actions.addFolder({ id: '1', name: 'test' }),
                1
            )
        );
        expect(result.status).toBe('ERROR');
        expect(result.error?.message).toBe('Node with id 1 already exists!');
    });

    it('should reject operation with existing index', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        await server.addDriveOperation(
            '1',
            buildOperation(drive, actions.addFolder({ id: '1', name: 'test' }))
        );

        const result = await server.addDriveOperation(
            '1',
            buildOperation(
                drive,
                actions.addFolder({ id: '2', name: 'test 2' })
            )
        );
        expect(result.status).toBe('CONFLICT');
    });

    it('should reject operation with missing index', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        await server.addDriveOperation(
            '1',
            buildOperation(drive, actions.addFolder({ id: '1', name: 'test' }))
        );

        const result = await server.addDriveOperation(
            '1',
            buildOperation(
                drive,
                actions.addFolder({ id: '2', name: 'test 2' }),
                2
            )
        );
        expect(result.status).toBe('MISSING');
    });

    it('should accept operations until invalid operation', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        let drive = await server.getDrive('1');
        const result = await server.addDriveOperations('1', [
            ...buildOperations(drive, [
                actions.addFolder({ id: '1', name: 'test 1' }),
                actions.addFolder({ id: '2', name: 'test 2' }),
                actions.addFolder({ id: '3', name: 'test 3' })
            ]),
            buildOperation(
                drive,
                actions.addFolder({ id: '4', name: 'test 4' }),
                2
            )
        ]);

        expect(result.status).toBe('CONFLICT');
        expect(result.operations.length).toBe(3);

        drive = await server.getDrive('1');
        expect(drive.state.global.nodes).toStrictEqual([
            expect.objectContaining({ id: '1', name: 'test 1' }),
            expect.objectContaining({ id: '2', name: 'test 2' }),
            expect.objectContaining({ id: '3', name: 'test 3' })
        ]);
    });

    it('should apply operations with different scopes', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        let drive = await server.getDrive('1');
        const result = await server.addDriveOperations(
            '1',
            buildOperations(drive, [
                actions.addFolder({ id: '1', name: 'test 1' }),
                actions.addFolder({ id: '2', name: 'test 2' }),
                actions.setAvailableOffline({ availableOffline: true })
            ])
        );

        expect(result.status).toBe('SUCCESS');
        expect(result.operations.length).toBe(3);

        drive = await server.getDrive('1');
        expect(drive.state.global.nodes).toStrictEqual([
            expect.objectContaining({ id: '1', name: 'test 1' }),
            expect.objectContaining({ id: '2', name: 'test 2' })
        ]);
        expect(drive.state.local.availableOffline).toBe(true);
    });

    it('should detect conflict with operations with mixed scopes', async () => {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        let drive = await server.getDrive('1');
        const result = await server.addDriveOperations('1', [
            ...buildOperations(drive, [
                actions.addFolder({ id: '1', name: 'test 1' }),
                actions.addFolder({ id: '2', name: 'test 2' }),
                actions.setAvailableOffline({ availableOffline: true })
            ]),
            buildOperation(
                drive,
                actions.addFolder({ id: '3', name: 'test 3' }),
                1
            )
        ]);

        expect(result.status).toBe('CONFLICT');
        expect(result.operations.length).toBe(3);

        drive = await server.getDrive('1');
        expect(drive.state.global.nodes).toStrictEqual([
            expect.objectContaining({ id: '1', name: 'test 1' }),
            expect.objectContaining({ id: '2', name: 'test 2' })
        ]);
        expect(drive.state.local.availableOffline).toBe(true);
    });
});

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
    action: DocumentDriveAction | BaseAction
): Operation<DocumentDriveAction | BaseAction> {
    const newDocument = reducer(document, action);
    return newDocument.operations[action.scope].slice().pop()!;
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

        const result = await server.addDriveOperation('1', {
            ...buildOperation(
                drive,
                actions.addFolder({ id: '1', name: 'test' })
            ),
            index: 1
        });
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

        const result = await server.addDriveOperation('1', {
            ...buildOperation(
                drive,
                actions.addFolder({ id: '2', name: 'test 2' })
            ),
            index: 0
        });
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

        const result = await server.addDriveOperation('1', {
            ...buildOperation(
                drive,
                actions.addFolder({ id: '2', name: 'test 2' })
            ),
            index: 2
        });
        expect(result.status).toBe('MISSING');
    });
});

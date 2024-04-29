import {
    utils as DocumentDriveUtils,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage/memory';
import { expectUUID } from './utils';

const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[];


describe("Document Drive Server queuing", () => {

    it('adds file to server', async ({ expect }) => {
        vi.useRealTimers();
        const server = new DocumentDriveServer(
            documentModels,
            new MemoryStorage()
        );

        await server.initialize();
        await server.addDrive({
            global: {
                id: '1',
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
        let drive = await server.getDrive('1');
        // performs ADD_FILE operation locally
        drive = reducer(
            drive,
            DocumentDriveUtils.generateAddNodeAction(
                drive.state.global,
                {
                    id: '1.1',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                },
                ['global', 'local']
            )
        );

        drive = reducer(
            drive,
            DocumentDriveUtils.generateAddNodeAction(
                drive.state.global,
                {
                    id: '1.2',
                    name: 'document 2',
                    documentType: 'powerhouse/document-model'
                },
                ['global', 'local']
            )
        );

        drive = reducer(
            drive,
            DocumentDriveUtils.generateAddNodeAction(
                drive.state.global,
                {
                    id: '1.3',
                    name: 'document 1',
                    documentType: 'powerhouse/document-model'
                },
                ['global', 'local']
            )
        );

        // dispatches operation to server
        const operation = drive.operations.global[0]!;

        const results = await Promise.all([
            server.queueDriveOperations('1', [operation]),
            server.queueDriveOperations('1', [drive.operations.global[1]!]),
            server.queueDriveOperations('1', [drive.operations.global[2]!]),
        ]);

        const [result1, result2, result3] = results;
        expect(result1.status).toBe('SUCCESS');
        expect(result2.status).toBe('SUCCESS');
        expect(result3.status).toBe('SUCCESS');
    });
}
);

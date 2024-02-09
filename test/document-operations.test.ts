import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import {
    Action,
    Document,
    DocumentModel,
    Operation,
    Reducer
} from 'document-model/document';
import {
    DocumentModelDocument,
    module as DocumentModelLib,
    actions,
    reducer
} from 'document-model/document-model';
import { beforeEach } from 'node:test';
import { describe, expect, it } from 'vitest';
import { DocumentDriveServer } from '../src';

function buildOperation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    action: Action,
    index?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<any> {
    const newDocument = reducer(document, action);
    const operation = newDocument.operations[action.scope].slice().pop()!;
    return { ...operation, index: index ?? operation.index };
}

function buildOperations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: Array<Action>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<Action>[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: Operation<Action>[] = [];
    for (const action of actions) {
        document = reducer(document, action);
        const operation = document.operations[action.scope].slice().pop()!;
        operations.push(operation);
    }
    return operations;
}

describe('Document operations', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    let server = new DocumentDriveServer(documentModels);
    beforeEach(async () => {
        server = new DocumentDriveServer(documentModels);
        await server.initialize();
    });

    async function buildFile() {
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
            buildOperation(
                DocumentDrive.reducer,
                drive,
                DocumentDrive.actions.addFile({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            )
        );

        return server.getDocument('1', '1') as Promise<DocumentModelDocument>;
    }

    it('should be able to apply an operation to a document in the drive', async () => {
        let document = await buildFile();

        const result = await server.addOperation(
            '1',
            '1',
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test' })
            )
        );
        expect(result.status).toBe('SUCCESS');

        document = (await server.getDocument(
            '1',
            '1'
        )) as DocumentModelDocument;
        expect(document.state.global.name).toBe('test');
    });

    it('should reject invalid operation', async () => {
        const document = await buildFile();

        const result = await server.addOperation('1', '1', {
            ...buildOperation(
                reducer,
                document,
                actions.setStateSchema({
                    schema: 'test',
                    scope: 'global'
                })
            ),
            input: { schema: 'test', scope: 'invalid' }
        });
        expect(result.status).toBe('ERROR');
        expect(result.error?.message).toBe('Invalid scope: invalid');
    });

    it('should reject operation with existing index', async () => {
        const document = await buildFile();

        const result = await server.addOperations('1', '1', [
            buildOperation(
                reducer,
                document,
                actions.setModelName({
                    name: 'test'
                })
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 2'
                }),
                0
            )
        ]);
        expect(result.status).toBe('CONFLICT');
        expect(result.error?.message).toBe('Conflicting operation on index 0');
    });

    it('should reject operation with missing index', async () => {
        const document = await buildFile();

        const result = await server.addOperations('1', '1', [
            buildOperation(
                reducer,
                document,
                actions.setModelName({
                    name: 'test'
                })
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 2'
                }),
                2
            )
        ]);
        expect(result.status).toBe('MISSING');
        expect(result.error?.message).toBe('Missing operation on index 1');
    });

    it('should accept operations until invalid operation', async () => {
        let document = await buildFile();

        const result = await server.addOperations('1', '1', [
            ...buildOperations(reducer, document, [
                actions.setModelName({
                    name: 'test'
                }),
                actions.setAuthorName({
                    authorName: 'test'
                }),
                actions.setAuthorWebsite({
                    authorWebsite: 'www'
                })
            ]),
            buildOperation(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 2'
                }),
                2
            )
        ]);

        expect(result.status).toBe('CONFLICT');
        expect(result.operations.length).toBe(3);

        document = (await server.getDocument(
            '1',
            '1'
        )) as DocumentModelDocument;
        expect(document.state.global).toEqual(
            expect.objectContaining({
                name: 'test',
                author: { name: 'test', website: 'www' }
            })
        );
    });
});

import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { BaseAction, DocumentModel } from 'document-model/document';
import {
    DocumentModelAction,
    DocumentModelDocument,
    module as DocumentModelLib,
    actions,
    reducer
} from 'document-model/document-model';
import { beforeEach } from 'node:test';
import { describe, expect, it } from 'vitest';
import { DocumentDriveServer } from '../src';
import { buildOperation, buildOperations } from './utils';

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

    describe('Operations', () => {
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
            expect(result.error?.message).toBe(
                'Conflicting operation on index 0'
            );
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

    describe('skip operations', () => {
        async function getDocumentWithOps(
            newActions: (DocumentModelAction | BaseAction)[] = []
        ) {
            let document = await buildFile();

            const testActions = [
                actions.setModelName({ name: 'test' }),
                actions.setName('test'),
                actions.setModelId({ id: 'testId' }),
                actions.setModelDescription({ description: 'testDescription' }),
                actions.setModelExtension({ extension: 'testExtension' }),
                ...newActions
            ];

            for (const action of testActions) {
                document = (await server.getDocument(
                    '1',
                    '1'
                )) as DocumentModelDocument;

                const op = buildOperation(reducer, document, action);
                await server.addOperation('1', '1', op);
            }

            document = (await server.getDocument(
                '1',
                '1'
            )) as DocumentModelDocument;

            return document;
        }

        it('should undo latest operation', async () => {
            const undoAction = [actions.undo()];
            const document = await getDocumentWithOps(undoAction);

            const expectedState = {
                name: 'test',
                id: 'testId',
                description: 'testDescription',
                extension: ''
            };

            expect(document.state.global).toMatchObject(expectedState);
            expect(document.revision.global).toBe(6);
            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]?.index).toBe(5);
            expect(document.operations.global[5]?.skip).toBe(1);
        });

        it('should update latest undo operation', async () => {
            const undoActions = [actions.undo(), actions.undo()];
            const document = await getDocumentWithOps(undoActions);

            const expectedState = {
                name: 'test',
                id: 'testId',
                description: '',
                extension: ''
            };

            expect(document.state.global).toMatchObject(expectedState);
            expect(document.revision.global).toBe(6);
            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]?.index).toBe(5);
            expect(document.operations.global[5]?.skip).toBe(2);
        });

        it('should update latest undo operation with skip = 3', async () => {
            const undoActions = [
                actions.undo(),
                actions.undo(),
                actions.undo()
            ];
            const document = await getDocumentWithOps(undoActions);

            const expectedState = {
                name: 'test',
                id: '',
                description: '',
                extension: ''
            };

            expect(document.state.global).toMatchObject(expectedState);
            expect(document.revision.global).toBe(6);
            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]?.index).toBe(5);
            expect(document.operations.global[5]?.skip).toBe(3);
        });

        it('should not update latest operation when latest op !== NOOP with skip', async () => {
            const undoActions = [
                actions.undo(),
                actions.setModelDescription({
                    description: 'testDescription2'
                }),
                actions.undo()
            ];
            const document = await getDocumentWithOps(undoActions);

            const expectedState = {
                name: 'test',
                id: 'testId',
                description: 'testDescription',
                extension: ''
            };

            expect(document.state.global).toMatchObject(expectedState);
            expect(document.revision.global).toBe(8);
            expect(document.operations.global.length).toBe(8);
            expect(document.operations.global[7]?.index).toBe(7);
            expect(document.operations.global[7]?.skip).toBe(1);
        });
    });
});

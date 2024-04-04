import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import {
    Action,
    BaseAction,
    DocumentModel,
    NOOPAction,
    Operation
} from 'document-model/document';
import {
    DocumentModelDocument,
    module as DocumentModelLib,
    actions,
    reducer
} from 'document-model/document-model';
import { beforeEach } from 'node:test';
import { describe, expect, it } from 'vitest';
import { ConflictOperationsManager, DocumentDriveServer } from '../src';
import { buildOpAndOverride, buildOperation } from './utils';

describe('Merge Manager', () => {
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

    describe('Combine operations', () => {
        describe('By Timestamp', () => {
            it('Should sort a single array of operations by their timestamp ', async () => {
                const document = await buildFile();
                const operations: Operation<NOOPAction & Action>[] = [];

                operations.push(
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-1' }),
                        { index: 1, timestamp: '2024-04-02T19:55:02.737Z' }
                    )
                );
                operations.push(
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-2' }),
                        { index: 2, timestamp: '2024-04-04T19:55:02.737Z' }
                    )
                );
                operations.push(
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-3' }),
                        { index: 3, timestamp: '2024-04-01T19:55:02.737Z' }
                    )
                );
                operations.push(
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-4' }),
                        { index: 4, timestamp: '2024-04-03T19:55:02.737Z' }
                    )
                );

                const combinedOperations =
                    ConflictOperationsManager.timestampMerge(operations);

                expect(combinedOperations.length).toBe(4);
                expect(combinedOperations[0]?.index).toBe(3);
                expect(combinedOperations[1]?.index).toBe(1);
                expect(combinedOperations[2]?.index).toBe(4);
                expect(combinedOperations[3]?.index).toBe(2);
            });

            it('Should sort multiple arrays of operations by their timestamp ', async () => {
                const document = await buildFile();
                const operations: Operation<NOOPAction & Action>[][] = [];

                operations.push([
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-1' }),
                        { index: 1, timestamp: '2024-04-02T19:55:02.737Z' }
                    ),
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-2' }),
                        { index: 2, timestamp: '2024-04-04T19:55:02.737Z' }
                    )
                ]);
                operations.push([
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-3' }),
                        { index: 3, timestamp: '2024-04-01T19:55:02.737Z' }
                    ),
                    buildOpAndOverride(
                        reducer,
                        document,
                        actions.setModelName({ name: 'test-4' }),
                        { index: 4, timestamp: '2024-04-03T19:55:02.737Z' }
                    )
                ]);

                const combinedOperations =
                    ConflictOperationsManager.timestampMerge(...operations);

                expect(combinedOperations.length).toBe(4);
                expect(combinedOperations[0]?.index).toBe(3);
                expect(combinedOperations[1]?.index).toBe(1);
                expect(combinedOperations[2]?.index).toBe(4);
                expect(combinedOperations[3]?.index).toBe(2);
            });
        });

        // describe('Stack', () => {});
    });

    describe('Conflicted scope', () => {
        it('should return true when an scope is in conflict', () => {
            const conflictManger = new ConflictOperationsManager();

            conflictManger.addConflictOperation('global', {
                hash: '1',
                index: 1,
                input: { name: 'test' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-02T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            expect(conflictManger.isConflictedScope('global')).toBe(true);
        });

        it('should return false when an scope is not in conflict', () => {
            const conflictManger = new ConflictOperationsManager();
            expect(conflictManger.isConflictedScope('global')).toBe(false);
        });
    });

    describe('Resolve conflicts', () => {
        it('should resolve conflicts using timestamp method', () => {
            const conflictManger = new ConflictOperationsManager(
                ConflictOperationsManager.timestampMerge
            );

            conflictManger.addConflictOperation('global', {
                hash: '2',
                index: 4,
                input: { name: 'test 1' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-02T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            conflictManger.addConflictOperation('global', {
                hash: '1',
                index: 4,
                input: { name: 'test 2' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-01T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            conflictManger.addConflictOperation('global', {
                hash: '4',
                index: 5,
                input: { name: 'test 3' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-04T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            conflictManger.addConflictOperation('global', {
                hash: '3',
                index: 5,
                input: { name: 'test 4' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-03T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            conflictManger.addConflictOperation('global', {
                hash: '5',
                index: 6,
                input: { name: 'test 5' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-05T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            });

            const resolvedOperations = conflictManger.resolveConflicts();

            // TODO: remove this comments
            // const res = Object.values(resolvedOperations)
            //     .map(resolvedScope => resolvedScope.resolvedOperations)
            //     .flat();
            // console.log(res);

            expect(resolvedOperations.global).toBeDefined();
            expect(resolvedOperations.global?.resolvedOperations.length).toBe(
                5
            );
            expect(resolvedOperations.global?.resolvedOperations).toMatchObject(
                [
                    { index: 6, hash: '1', skip: 2 },
                    { index: 7, hash: '2', skip: 0 },
                    { index: 8, hash: '3', skip: 0 },
                    { index: 9, hash: '4', skip: 0 },
                    { index: 10, hash: '5', skip: 0 }
                ]
            );
        });

        it("should resolve conflicts when there's 2 conflicting ops", () => {
            const conflictManger = new ConflictOperationsManager(
                ConflictOperationsManager.timestampMerge
            );

            conflictManger.addConflictOperation('global', {
                hash: '1',
                index: 1,
                input: { name: 'test 1' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-04T22:02:13.558Z',
                type: 'SET_MODEL_NAME'
            });

            conflictManger.addConflictOperation('global', {
                hash: '1',
                index: 1,
                input: { name: 'test 2' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-03T22:02:13.556Z',
                type: 'SET_MODEL_NAME'
            });

            const resolvedOperations = conflictManger.resolveConflicts();

            expect(resolvedOperations.global).toBeDefined();
            expect(resolvedOperations.global?.resolvedOperations.length).toBe(
                2
            );
        });

        it('should return operations to update when there are conflicts', () => {
            const conflictManger = new ConflictOperationsManager(
                ConflictOperationsManager.timestampMerge
            );

            const op0: Operation<Action | BaseAction> = {
                hash: '3',
                index: 3,
                input: { name: 'test 0' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-03-01T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            const op1: Operation<Action | BaseAction> = {
                hash: '2',
                index: 4,
                input: { name: 'test 1' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-02T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            const op2: Operation<Action | BaseAction> = {
                hash: '1',
                index: 4,
                input: { name: 'test 2' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-01T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            const op3: Operation<Action | BaseAction> = {
                hash: '4',
                index: 5,
                input: { name: 'test 3' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-04T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            const op4: Operation<Action | BaseAction> = {
                hash: '3',
                index: 5,
                input: { name: 'test 4' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-03T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            const op5: Operation<Action | BaseAction> = {
                hash: '5',
                index: 6,
                input: { name: 'test 5' },
                scope: 'global',
                skip: 0,
                timestamp: '2024-04-05T19:55:02.737Z',
                type: 'SET_MODEL_NAME'
            };

            conflictManger.setDocumentOperations({
                global: [op0, op1, op3]
            });

            conflictManger.addConflictOperation('global', op1);
            conflictManger.addConflictOperation('global', op2);
            conflictManger.addConflictOperation('global', op3);
            conflictManger.addConflictOperation('global', op4);
            conflictManger.addConflictOperation('global', op5);

            const result = conflictManger.resolveConflicts();

            expect(result.global).toBeDefined();
            expect(result.global?.updatedOperations.length).toBe(2);
            expect(result.global?.updatedOperations).toMatchObject([op1, op3]);
        });
    });

    describe('AddOperation conflict resolution', () => {
        it('should resolve operation index conflicts when adding new operations', async () => {
            let document = await buildFile();

            const op0 = buildOpAndOverride(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 1'
                }),
                { index: 0 }
            );

            const op1 = buildOpAndOverride(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 2'
                }),
                { index: 1 }
            );

            await server.addOperations('1', '1', [op0, op1]);

            const duplicatedIndexOp = buildOpAndOverride(
                reducer,
                document,
                actions.setModelName({
                    name: 'test 3'
                }),
                { index: 1 }
            );

            const result = await server.addOperations('1', '1', [
                duplicatedIndexOp
            ]);

            document = (await server.getDocument(
                '1',
                '1'
            )) as DocumentModelDocument;

            expect(result.status).toBe('SUCCESS');
            expect(document.operations.global.length).toBe(4);
            expect(document.state.global.name).toBe('test 3');
            expect(document.operations.global).toMatchObject([
                {
                    index: 0,
                    type: 'SET_MODEL_NAME',
                    skip: 0,
                    input: { name: 'test 1' }
                },
                { index: 1, type: 'NOOP', skip: 0, input: {} },
                {
                    index: 2,
                    type: 'SET_MODEL_NAME',
                    skip: 1,
                    input: { name: 'test 2' }
                },
                {
                    index: 3,
                    type: 'SET_MODEL_NAME',
                    skip: 0,
                    input: { name: 'test 3' }
                }
            ]);
        });
    });
});

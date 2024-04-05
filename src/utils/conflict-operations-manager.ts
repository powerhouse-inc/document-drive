import {
    Action,
    BaseAction,
    Operation,
    OperationScope
} from 'document-model/document';

type MergeMethod<A extends Action = Action> = (
    ...operations: Operation<A | BaseAction>[][]
) => Operation<A | BaseAction>[];

type OperationHistory<A extends Action = Action> = Partial<
    Record<OperationScope, Operation<A | BaseAction>[]>
>;

type ResolvedOperationsResult<A extends Action = Action> = Partial<
    Record<
        OperationScope,
        {
            resolvedOperations: Operation<A | BaseAction>[];
            updatedOperations: Operation<A | BaseAction>[];
        }
    >
>;

export class ConflictOperationsManager {
    private conflictOperationsByScope: OperationHistory = {};
    private documentOperations: OperationHistory = {};
    private operationsToUpdate: OperationHistory = {};

    constructor(
        private mergeMethod: MergeMethod = ConflictOperationsManager.timestampMerge,
        operationHistory?: OperationHistory
    ) {
        if (operationHistory) {
            this.documentOperations = operationHistory;
        }
    }

    public static timestampMerge: MergeMethod = (...operations) => {
        const flatOperations = operations.flat();
        const sortedOperations = flatOperations.sort(
            (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
        );

        return sortedOperations;
    };

    public static stackMerge: MergeMethod = (...operations) => {
        return operations.flat();
    };

    setDocumentOperations(operations: OperationHistory) {
        this.documentOperations = operations;
    }

    getDocumentOperations() {
        return this.documentOperations;
    }

    getConflictOperations() {
        return this.conflictOperationsByScope;
    }

    addConflictOperation<A extends Action = Action>(
        scope: OperationScope,
        ...operations: Operation<A | BaseAction>[]
    ) {
        const existingOperations = this.conflictOperationsByScope[scope] || [];

        const operationsToUpdate = (
            this.documentOperations[scope] || []
        ).filter(op => operations.some(newOp => newOp.index === op.index));

        // remove duplicated operations and update operationsToUpdate
        this.operationsToUpdate[scope] = Object.values(
            [
                ...(this.operationsToUpdate[scope] || []),
                ...operationsToUpdate
            ].reduce(
                (acc, op) => ({
                    ...acc,
                    [op.index]: op
                }),
                {}
            )
        );

        this.conflictOperationsByScope[scope] = [
            ...existingOperations,
            ...operations
        ];
    }

    isConflictedScope(scope: OperationScope) {
        return Boolean(this.conflictOperationsByScope[scope]);
    }

    resolveConflicts() {
        const resolvedOperations = Object.keys(
            this.conflictOperationsByScope
        ).reduce<ResolvedOperationsResult>((acc, scope) => {
            const operations =
                this.conflictOperationsByScope[scope as OperationScope] || [];

            const firstConflictedIndex = [...operations].sort(
                (a, b) => a.index - b.index
            )[0]?.index;

            if (firstConflictedIndex === undefined) return {};

            const conflictedOperaionsInScope = (
                this.documentOperations[scope as OperationScope] || []
            ).filter(op => op.index >= firstConflictedIndex);

            let sortedOperations = this.mergeMethod(
                operations,
                conflictedOperaionsInScope
            );

            const lastIndexWithConflicts =
                conflictedOperaionsInScope.sort((a, b) => b.index - a.index)[0]
                    ?.index || 0;
            const overlapOperations = conflictedOperaionsInScope.length;

            sortedOperations = sortedOperations.map((op, index) => {
                if (index === 0) return { ...op, skip: overlapOperations };
                // override skip value
                return { ...op, skip: 0 };
            });

            const reIndexedOperations = sortedOperations.map((op, i) => {
                const newOpIndex = lastIndexWithConflicts + 1 + i;
                return { ...op, index: newOpIndex };
            });

            return {
                ...acc,
                [scope]: {
                    resolvedOperations: reIndexedOperations,
                    updatedOperations:
                        this.operationsToUpdate[scope as OperationScope] || []
                }
            };
        }, {});

        return resolvedOperations;
    }
}

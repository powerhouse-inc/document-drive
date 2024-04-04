import {
    Action,
    BaseAction,
    Operation,
    OperationScope
} from 'document-model/document';

type MergeMethod<A extends Action = Action> = (
    ...operations: Operation<A | BaseAction>[][]
) => Operation<A | BaseAction>[];

type ConflictOperationHistory<A extends Action = Action> = Partial<
    Record<OperationScope, Operation<A | BaseAction>[]>
>;

export class ConflictOperationsManager {
    private conflictOperationsByScope: ConflictOperationHistory = {};

    constructor(
        private mergeMethod: MergeMethod = ConflictOperationsManager.timestampMerge
    ) {}

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

    getConflictOperations() {
        return this.conflictOperationsByScope;
    }

    addConflictOperation<A extends Action = Action>(
        scope: OperationScope,
        ...operations: Operation<A | BaseAction>[]
    ) {
        const existingOperations = this.conflictOperationsByScope[scope] || [];

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
        ).reduce<ConflictOperationHistory>((acc, scope) => {
            const operations =
                this.conflictOperationsByScope[scope as OperationScope] || [];
            let sortedOperations = this.mergeMethod(operations);
            const operationsIndex = sortedOperations.map(op => op.index);

            // find duplicates
            const duplicates = operationsIndex.filter(
                (opIndex, index) => operationsIndex.indexOf(opIndex) !== index
            );

            const lastIndexWithConflicts =
                duplicates.sort((a, b) => b - a)[0] || 0;
            const overlapOperations = duplicates.length;

            sortedOperations = sortedOperations.map((op, index) => {
                if (index === 0) return { ...op, skip: overlapOperations };
                return op;
            });

            const reIndexedOperations = sortedOperations.map((op, i) => {
                const newOpIndex = lastIndexWithConflicts + 1 + i;
                return { ...op, index: newOpIndex };
            });

            return {
                ...acc,
                [scope]: reIndexedOperations
            };
        }, {});

        return resolvedOperations;
    }
}

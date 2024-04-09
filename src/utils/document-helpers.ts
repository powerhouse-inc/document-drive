import { Operation } from 'document-model/document';
import stringify from 'json-stringify-deterministic';

type OperationIndex = {
    index: number;
    skip: number;
};

export enum IntegrityIssueType {
    UNEXPECTED_INDEX = 'UNEXPECTED_INDEX'
}

type IntegrityIssue = {
    operation: OperationIndex;
    issue: IntegrityIssueType;
    message: string;
};

type Reshuffle = (
    startIndex: OperationIndex,
    opsA: Operation[],
    opsB: Operation[]
) => Operation[];

export function checkCleanedOperationsIntegrity(
    operations: Operation[]
): IntegrityIssue[] {
    const result: IntegrityIssue[] = [];

    // 1:1 1
    // 0:0 0 -> 1:0 1 -> 2:0 -> 3:0 -> 4:0 -> 5:0
    // 0:0 0 -> 2:1 1 -> 3:0 -> 4:0 -> 5:0
    // 0:0 0 -> 3:2 1 -> 4:0 -> 5:0
    // 0:0 0 -> 3:2 1 -> 5:1

    // 0:3 (expected 0, got -3)
    // 1:2 (expected 0, got -1)
    // 0:0 -> 1:1
    // 0:0 -> 2:2
    // 0:0 -> 3:2 -> 5:2

    let currentIndex = -1;
    for (const nextOperation of operations) {
        if (nextOperation.index - nextOperation.skip !== currentIndex + 1) {
            result.push({
                operation: {
                    index: nextOperation.index,
                    skip: nextOperation.skip
                },
                issue: IntegrityIssueType.UNEXPECTED_INDEX,
                message: `Expected index ${currentIndex + 1} with skip 0 or equivalent, got index ${nextOperation.index} with skip ${nextOperation.skip}`
            });
        }

        currentIndex = nextOperation.index;
    }

    return result;
}

// [] -> []
// [0:0] -> [0:0]

// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:1 2:0 => 1:1 2:0, removals 1, no issues

// 0:0 1:1 2:0 3:1 => 1:1 3:1, removals 2, no issues
// 0:0 1:1 2:0 3:3 => 3:3

// 1:1 2:0 3:0 => 1:1 2:0 3:0, removals 0, no issues
// 1:0 0:0 2:0 => 2:0, removals 2, issues [UNEXPECTED_INDEX, INDEX_OUT_OF_ORDER]
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues

export function garbageCollect(operations: Operation[]): Operation[] {
    const result: Operation[] = [];

    let i = operations.length - 1;

    while (i > -1) {
        result.unshift(operations[i]!);

        let skipsToGo = operations[i]?.skip || 0;
        let lastProcessedIndex = operations[i]?.index || 0;
        let j = i - 1;

        while (skipsToGo > 0 && j > -1) {
            if ((operations[j]?.index || 0) !== lastProcessedIndex) {
                skipsToGo--;
                lastProcessedIndex = operations[j]?.index || 0;
            }

            j--;
        }

        i = j;
    }

    return result;
}

export function addUndo(operations: Operation[]): Operation[] {
    // if (last operation is noop) {
    // add operation(NOOP, currentIndex, nextSkipNumber(operations))
    // } else {
    // add operation(NOOP, currentIndex+1, skip=1)
    // }

    const sortedOperations = [...sortOperations(operations)];
    const latestOperation = sortedOperations[sortedOperations.length - 1];

    if (!latestOperation) return sortedOperations;

    if (latestOperation.type === 'NOOP') {
        sortedOperations.push({
            ...latestOperation,
            index: latestOperation.index,
            type: 'NOOP',
            skip: nextSkipNumber(sortedOperations)
        });
    } else {
        sortedOperations.push({
            ...latestOperation,
            type: 'NOOP',
            index: latestOperation.index + 1,
            timestamp: new Date().toISOString(),
            input: {},
            skip: 1
        });
    }

    return sortedOperations;
}

// [0:0 2:0 1:0 3:3 3:1] => [0:0 1:0 2:0 3:1 3:3]
// Sort by index _and_ skip number
export function sortOperations(operations: Operation[]): Operation[] {
    return operations
        .sort((a, b) => a.skip - b.skip)
        .sort((a, b) => a.index - b.index);
}

// [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
// GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
// Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
// Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
// merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
export const reshuffleByTimestamp: Reshuffle = (startIndex, opsA, opsB) => {
    return [...opsA, ...opsB]
        .sort(
            (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
        )
        .map((op, i) => ({
            ...op,
            index: startIndex.index + i,
            skip: i === 0 ? startIndex.skip : 0
        }));
};

export const reshuffleByTimestampAndIndex: Reshuffle = (
    startIndex,
    opsA,
    opsB
) => {
    return [...opsA, ...opsB]
        .sort(
            (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
        )
        .sort((a, b) => a.index - b.index)
        .map((op, i) => ({
            ...op,
            index: startIndex.index + i,
            skip: i === 0 ? startIndex.skip : 0
        }));
};

// TODO: implement better operation equality function 
export function operationsAreEqual(op1:Operation, op2:Operation) {
    return stringify(op1) === stringify(op2);
}

export function split(
    targetOperations: Operation[],
    mergeOperations: Operation[]
): [Operation[], Operation[], Operation[]] {
    const commonOperations: Operation[] = [];
    const targetDiffOperations: Operation[] = [];
    const mergeDiffOperations: Operation[] = [];

    // get bigger array length
    const maxLength = Math.max(targetOperations.length, mergeOperations.length);

    let splitHappened = false;
    for (let i = 0; i < maxLength; i++) {
        const targetOperation = targetOperations[i];
        const mergeOperation = mergeOperations[i];

        if (targetOperation && mergeOperation) {
            if (!splitHappened && operationsAreEqual(targetOperation, mergeOperation)) {
                commonOperations.push(targetOperation);
            } else {
                splitHappened = true;
                targetDiffOperations.push(targetOperation);
                mergeDiffOperations.push(mergeOperation);
            }

        } else if (targetOperation) {
            targetDiffOperations.push(targetOperation);

        } else if (mergeOperation) {
            mergeDiffOperations.push(mergeOperation);
        }
    }

    return [commonOperations, targetDiffOperations, mergeDiffOperations];
}

// [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
// GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
// Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
// Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
// merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
export function merge(
    targetOperations: Operation[],
    mergeOperations: Operation[],
    reshuffle: Reshuffle
): Operation[] {
    const [, _targetOperations, _mergeOperatios] = split(
        garbageCollect(targetOperations),
        garbageCollect(mergeOperations)
    );

    const latestTargetOperation = [..._targetOperations].pop();
    const newOperationHistory = reshuffle(
        {
            index: (latestTargetOperation?.index ?? -1) + 1,
            skip: _targetOperations.length + (latestTargetOperation?.skip ?? 0)
        },
        _targetOperations,
        _mergeOperatios
    );

    return garbageCollect([...targetOperations, ...newOperationHistory]);
}

// [] => -1
// [0:0] => -1
// [0:0 1:0] => 1
// [0:0 1:1] => -1
// [1:1] => -1
// [0:0 1:0 2:0] => 1
// [0:0 1:0 2:0 2:1] => 2
// [0:0 1:0 2:0 2:1 2:2] => -1
// [0:0 1:1 2:0] => 2
// [0:0 1:1 2:2] => -1
// [0:0 1:1 2:0 3:0] => 1
// [0:0 1:1 2:0 3:1] => 3
// [0:0 1:1 2:0 3:3] => -1
// [50:50 100:50 150:50 151:0 152:0 153:0 154:3] => 53

export function nextSkipNumber(operations: Operation[]): number {
    if (operations.length < 1) {
        return -1;
    }

    const cleanedOperations = garbageCollect(operations);

    let nextSkip =
        (cleanedOperations[cleanedOperations.length - 1]?.skip || 0) + 1;

    if (cleanedOperations.length > 1) {
        nextSkip += cleanedOperations[cleanedOperations.length - 2]?.skip || 0;
    }

    return (cleanedOperations[cleanedOperations.length - 1]?.index || -1) <
        nextSkip
        ? -1
        : nextSkip;
}

export const checkOperationsIntegrity = (
    operations: Operation[]
): IntegrityIssueType[] => {
    const issues: IntegrityIssueType[] = [];

    let previousIndex: number = -1;
    let previousSkip: number = -1;

    // history = [ { index: 0, skip: 0}, { index: 0, skip: 1 } ]

    // history = [ { index: 3, skip: 3 } ]

    for (const nextOperation of operations) {
        if (nextOperation.index == previousIndex) {
        }
    }

    return issues;
};

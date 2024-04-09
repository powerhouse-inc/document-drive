import { describe, expect, it } from 'vitest';

import {
    IntegrityIssueType,
    checkCleanedOperationsIntegrity,
    garbageCollect
} from '../../src/utils/document-helpers';
import { buildOperation, buildOperations } from './utils';

describe('garbageCollect', () => {
    it('should return the same list of operations if there is no issues or removals', () => {
        // 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
        const operations = buildOperations([
            { index: 0, skip: 0 },
            { index: 1, skip: 0 },
            { index: 2, skip: 0 }
        ]);

        const result = garbageCollect(operations);

        expect(result.length).toBe(operations.length);
        expect(result).toMatchObject(operations);
    });

    it('should remove a single skipped operation', () => {
        // 0:0 1:1 2:0 => 1:1 2:0, removals 1, no issues
        const op0 = buildOperation({ index: 0, skip: 0 });
        const op1 = buildOperation({ index: 1, skip: 1 });
        const op2 = buildOperation({ index: 2, skip: 0 });

        const operations = [op0, op1, op2];
        const result = garbageCollect(operations);

        expect(result.length).toBe(2);
        expect(result).toMatchObject([op1, op2]);
    });

    it('should remove all the skipped operations', () => {
        // 0:0 1:1 2:0 3:1 => 1:1 3:1, removals 2, no issues
        const op0 = buildOperation({ index: 0, skip: 0 });
        const op1 = buildOperation({ index: 1, skip: 1 });
        const op2 = buildOperation({ index: 2, skip: 0 });
        const op3 = buildOperation({ index: 3, skip: 1 });

        const operations = [op0, op1, op2, op3];
        const result = garbageCollect(operations);

        expect(result.length).toBe(2);
        expect(result).toMatchObject([op1, op3]);
    });

    it('should keep only the last operation when it skips all the previous operations', () => {
        // 0:0 1:1 2:0 3:3 => 3:3
        const op0 = buildOperation({ index: 0, skip: 0 });
        const op1 = buildOperation({ index: 1, skip: 1 });
        const op2 = buildOperation({ index: 2, skip: 0 });
        const op3 = buildOperation({ index: 3, skip: 3 });

        const operations = [op0, op1, op2, op3];
        const result = garbageCollect(operations);

        expect(result.length).toBe(1);
        expect(result).toMatchObject([op3]);
    });

    it('should not increase removals if an skipped operation is not present', () => {
        // 1:1 2:0 3:0 => 1:1 2:0 3:0, removals 0, no issues
        const op0 = buildOperation({ index: 1, skip: 1 });
        const op1 = buildOperation({ index: 2, skip: 0 });
        const op2 = buildOperation({ index: 3, skip: 0 });

        const operations = [op0, op1, op2];
        const result = garbageCollect(operations);

        expect(result.length).toBe(3);
        expect(result).toMatchObject(operations);
    });

    it('should find out of order, and unexpected index errors', () => {
        // 1:0 0:0 2:0 => 2:0, removals 2, issues [UNEXPECTED_INDEX, INDEX_OUT_OF_ORDER]
        const op0 = buildOperation({ index: 1, skip: 0 });
        const op1 = buildOperation({ index: 0, skip: 0 });
        const op2 = buildOperation({ index: 2, skip: 0 });

        const operations = [op0, op1, op2];
        const result = garbageCollect(operations);
        const resultIssues = checkCleanedOperationsIntegrity(result);

        expect(result.length).toBe(3);
        expect(result).toMatchObject(operations);

        expect(resultIssues.length).toBe(3);

        for (const issue of resultIssues) {
            expect(issue.issue).toBe(IntegrityIssueType.UNEXPECTED_INDEX);
        }
    });

    it('should find out of order, and unexpected index errors', () => {
        // 1:0 0:0 2:0 => 2:0, removals 2, issues [UNEXPECTED_INDEX, INDEX_OUT_OF_ORDER]
        const op0 = buildOperation({ index: 1, skip: 0 });
        const op1 = buildOperation({ index: 0, skip: 0 });
        const op2 = buildOperation({ index: 2, skip: 0 });

        const operations = [op0, op1, op2];
        const result = garbageCollect(operations);
        const resultIssues = checkCleanedOperationsIntegrity(result);

        expect(result.length).toBe(3);
        expect(result).toMatchObject(operations);

        expect(resultIssues.length).toBe(3);

        for (const issue of resultIssues) {
            expect(issue.issue).toBe(IntegrityIssueType.UNEXPECTED_INDEX);
        }
    });

    it('should return an empty array if there is no operations', () => {
        const result = garbageCollect([]);
        expect(result).toMatchObject([]);
    });

    it('should return the same single operation if there is no skip value', () => {
        // 0:0 => 0:0
        const op0 = buildOperation({ index: 0, skip: 0 });

        const operations = [op0];
        const result = garbageCollect(operations);

        expect(result.length).toBe(1);
        expect(result).toMatchObject(operations);
    });

    it('should return the same single operation if the index and skip value are valid', () => {
        // 1:1 => 1:1
        const op0 = buildOperation({ index: 1, skip: 1 });

        const operations = [op0];
        const result = garbageCollect(operations);

        expect(result.length).toBe(1);
        expect(result).toMatchObject(operations);
    });

    it('should return only the latest opeartion if all the previous ones are skipped', () => {
        // [0:0 1:0 2:0 2:1 2:2] => -1
        const op0 = buildOperation({ index: 0, skip: 0 });
        const op1 = buildOperation({ index: 1, skip: 0 });
        const op2 = buildOperation({ index: 1, skip: 1 });
        const op3 = buildOperation({ index: 2, skip: 0 });
        const op4 = buildOperation({ index: 2, skip: 1 });
        const op5 = buildOperation({ index: 2, skip: 2 });

        const operations = [op0, op1, op2, op3, op4, op5];
        const result = garbageCollect(operations);

        expect(result.length).toBe(1);
        expect(result).toMatchObject([op5]);
    });
});

import { describe, expect, it } from 'vitest';

import { checkCleanedOperationsIntegrity } from '../../src/utils/document-helpers';
import { buildOperations } from './utils';

describe('checkCleanedOperationsIntegrity', () => {
    const validScenarios = [
        { title: 'case 1', operations: [], expected: 0 },
        { title: 'case 2', operations: [{ index: 1, skip: 1 }], expected: 0 },
        {
            title: 'case 3',
            operations: [
                { index: 0, skip: 0 },
                { index: 1, skip: 0 },
                { index: 2, skip: 0 },
                { index: 3, skip: 0 },
                { index: 4, skip: 0 },
                { index: 5, skip: 0 }
            ],
            expected: 0
        },
        {
            title: 'case 4',
            operations: [
                { index: 0, skip: 0 },
                { index: 2, skip: 1 },
                { index: 3, skip: 0 },
                { index: 4, skip: 0 },
                { index: 5, skip: 0 }
            ],
            expected: 0
        },
        {
            title: 'case 5',
            operations: [
                { index: 0, skip: 0 },
                { index: 3, skip: 2 },
                { index: 4, skip: 0 },
                { index: 5, skip: 0 }
            ],
            expected: 0
        },
        {
            title: 'case 6',
            operations: [
                { index: 0, skip: 0 },
                { index: 3, skip: 2 },
                { index: 5, skip: 1 }
            ],
            expected: 0
        }
    ];

    const invalidScenarios = [
        { title: 'case 1', operations: [{ index: 0, skip: 3 }], expected: 1 },
        { title: 'case 2', operations: [{ index: 1, skip: 2 }], expected: 1 },
        {
            title: 'case 3',
            operations: [
                { index: 0, skip: 0 },
                { index: 1, skip: 1 }
            ],
            expected: 1
        },
        {
            title: 'case 4',
            operations: [
                { index: 0, skip: 0 },
                { index: 2, skip: 2 }
            ],
            expected: 1
        },
        {
            title: 'case 5',
            operations: [
                { index: 0, skip: 0 },
                { index: 3, skip: 2 },
                { index: 5, skip: 2 }
            ],
            expected: 1
        }
    ];

    it.each(validScenarios)('valid:  $title', testInput => {
        const operations = buildOperations(testInput.operations);

        const result = checkCleanedOperationsIntegrity(operations);
        expect(result.length).toBe(testInput.expected);
    });

    it.each(invalidScenarios)('invalid: $title', testInput => {
        const operations = buildOperations(testInput.operations);

        const result = checkCleanedOperationsIntegrity(operations);
        expect(result.length).toBe(testInput.expected);
    });
});

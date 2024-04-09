import { Operation } from 'document-model/document';

export type InputOperation = Partial<Omit<Operation, 'index' | 'skip'>> & {
    index: number;
    skip: number;
};

export const buildOperation = (input: InputOperation): Operation => ({
    hash: `hash-${input.index}`,
    timestamp: new Date().toISOString(),
    input: {},
    scope: 'global',
    type: 'TEST',
    ...input
});

export const buildOperations = (inputs: InputOperation[]): Operation[] =>
    inputs.map(buildOperation);

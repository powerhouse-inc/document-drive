import {
    Action,
    Document,
    NOOPAction,
    Operation,
    Reducer
} from 'document-model/document';

export function buildOperation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    action: Action,
    index?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<NOOPAction & Action> {
    const newDocument = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion
    const operation = newDocument.operations[action.scope]
        .slice()
        .pop()! as Operation;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { ...operation, index: index ?? operation.index } as Operation<
        NOOPAction & Action
    >;
}

export function buildOperations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: Reducer<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: Document<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: Array<Action>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Operation<NOOPAction & Action>[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: Operation<NOOPAction & Action>[] = [];
    for (const action of actions) {
        document = reducer(document, action);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const operation = document.operations[action.scope]
            .slice()
            .pop()! as Operation<NOOPAction & Action>;
        operations.push(operation);
    }
    return operations;
}

import {
    DocumentDriveDocument,
    documentModel as DocumentDriveModel,
    z
} from 'document-model-libs/document-drive';
import {
    Action,
    BaseAction,
    Document,
    DocumentOperations,
    Operation
} from 'document-model/document';

export function isDocumentDrive(
    document: Document
): document is DocumentDriveDocument {
    return (
        document.documentType === DocumentDriveModel.id &&
        z.DocumentDriveStateSchema().safeParse(document.state.global).success
    );
}

export function mergeOperations<A extends Action = Action>(
    currentOperations: DocumentOperations<A>,
    newOperations: Operation<A | BaseAction>[]
): DocumentOperations<A> {
    return newOperations.reduce((acc, curr) => {
        const operations = acc[curr.scope] ?? [];
        acc[curr.scope] = [...operations, curr] as Operation<A>[];
        return acc;
    }, currentOperations);
}

export function generateUUID(): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const crypto =
        typeof window !== 'undefined' ? window.crypto : require('crypto');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return crypto.randomUUID() as string;
}

export function applyUpdatedOperations<A extends Action = Action>(
    currentOperations: DocumentOperations<A>,
    updatedOperations: Operation<A | BaseAction>[]
): DocumentOperations<A> {
    return updatedOperations.reduce(
        (acc, curr) => {
            const operations = acc[curr.scope] ?? [];
            acc[curr.scope] = operations.map(op => {
                return op.index === curr.index ? curr : op;
            });
            return acc;
        },
        { ...currentOperations }
    );
}

export function isNoopUpdate(
    operation: Operation,
    latestOperation?: Operation
) {
    if (!latestOperation) {
        return false;
    }

    const isNoopOp = operation.type === 'NOOP';
    const isNoopLatestOp = latestOperation.type === 'NOOP';
    const isSameIndexOp = operation.index === latestOperation.index;
    const isSkipOpGreaterThanLatestOp = operation.skip > latestOperation.skip;

    return (
        isNoopOp &&
        isNoopLatestOp &&
        isSameIndexOp &&
        isSkipOpGreaterThanLatestOp
    );
}

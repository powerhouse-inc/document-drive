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

export function generateUUID() {
    const crypto =
        typeof window !== 'undefined' ? window.crypto : require('crypto');
    return crypto.randomUUID();
}

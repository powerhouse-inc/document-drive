import type { Operation } from 'document-model/document';
import type { ErrorStatus } from './types';

export class OperationError extends Error {
    status: ErrorStatus;
    operation: Operation | undefined;

    constructor(
        status: ErrorStatus,
        operation?: Operation,
        message?: string,
        cause?: unknown
    ) {
        super(message, { cause: cause ?? operation });
        this.status = status;
        this.operation = operation;
    }
}

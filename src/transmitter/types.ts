import { Operation, State } from 'document-model/document-model';

export interface InternalTransmitterService {
    getName(): string;
    processUpdate(
        driveId: string,
        documentId: string,
        scope: string,
        branch: string,
        revisionIndex: string,
        operations: Operation[],
        resultingState: State
    ): void;
}

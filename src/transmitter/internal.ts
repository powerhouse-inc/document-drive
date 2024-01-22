import { Operation, State } from 'document-model/document-model';

export class InternalTransmitterService {
    services: Map<string, InternalTransmitter> = new Map();

    registerService(service: InternalTransmitter) {
        this.services.set(service.getName(), service);
    }

    processUpdate(
        driveId: string,
        documentId: string,
        scope: string,
        branch: string,
        revisionIndex: string,
        operations: Operation[],
        resultingState: State
    ) {
        this.services.forEach(service => {
            service.processUpdate(
                driveId,
                documentId,
                scope,
                branch,
                revisionIndex,
                operations,
                resultingState
            );
        });
    }
}

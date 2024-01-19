import { Operation } from 'document-model/document';
import {
    DocumentDriveServer,
    ListenerRevision,
    StrandUpdate,
    UpdateStatus
} from '..';

export class SwitchboardPushTransmitter {
    protected drive: DocumentDriveServer;

    constructor(drive: DocumentDriveServer) {
        this.drive = drive;
    }

    async pushStrands(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        const results = await Promise.all(
            strands.map(strand => {
                const drive = strand.driveId;
                const documentId = strand.documentId;
                const scope = strand.scope;
                const branch = strand.branch;
                const operations: Operation[] = strand.operations.map(
                    operation => {
                        return {
                            ...operation,
                            scope,
                            branch,
                            index: operation.index,
                            timestamp: new Date().toTimeString()
                        };
                    }
                );

                return this.drive.addOperations(drive, documentId, operations);
            })
        );

        return results.map((result, i) => {
            const status: UpdateStatus = (
                result.success ? 'SUCCESS' : 'ERROR'
            ) as UpdateStatus;

            return {
                driveId: strands[i]!.driveId,
                documentId: strands[i]!.documentId,
                scope: strands[i]!.scope,
                branch: strands[i]!.branch,
                status: status,
                revision: 0
            };
        });
    }
}

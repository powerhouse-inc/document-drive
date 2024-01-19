import { OperationScope } from 'document-model/document';
import { DocumentDriveServer, StrandUpdate } from '..';

export class PullResponderTransmitter {
    protected drive: DocumentDriveServer;
    constructor(drive: DocumentDriveServer) {
        this.drive = drive;
    }

    async getStrands(
        listenerId: string,
        since?: Date
    ): Promise<StrandUpdate[]> {
        const cacheEntries = this.drive.getCacheEntries(listenerId);
        const strands: StrandUpdate[] = [];
        for (const entry of cacheEntries) {
            const doc = await this.drive.getDocument(
                entry.driveId,
                entry.syncUnit.documentId
            );
            const scope = entry.syncUnit.scope as OperationScope;
            const operations = doc.operations[scope];
            if (doc.revision[scope] > entry.syncUnit.revision) {
                strands.push({
                    driveId: entry.driveId,
                    documentId: entry.syncUnit.documentId,
                    scope,
                    branch: entry.syncUnit.branch,
                    operations: operations.filter(
                        op =>
                            op.index > entry.syncUnit.revision &&
                            (!since || new Date(op.timestamp) > since)
                    )
                });
            }
        }

        return strands;
    }
}

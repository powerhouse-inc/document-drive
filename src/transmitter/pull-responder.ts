import { OperationScope } from 'document-model/document';
import {
    BaseDocumentDriveServer,
    Listener,
    ListenerRevision,
    StrandUpdate
} from '..';
import { ListenerManager } from '../listener/manager';
import { ITransmitter } from './types';

export class PullResponderTransmitter implements ITransmitter {
    private drive: BaseDocumentDriveServer;
    private listener: Listener;
    private manager: ListenerManager;

    constructor(
        listener: Listener,
        drive: BaseDocumentDriveServer,
        manager: ListenerManager
    ) {
        this.listener = listener;
        this.drive = drive;
        this.manager = manager;
    }

    async transmit(): Promise<ListenerRevision[]> {
        return [];
    }

    async getStrands(
        listenerId: string,
        since?: string
    ): Promise<StrandUpdate[]> {
        // fetch listenerState from listenerManager
        const entries = this.manager.getCacheEntries(listenerId);

        // fetch operations from drive  and prepare strands
        const strands: StrandUpdate[] = [];

        for (const entry of entries) {
            if (entry.listenerRev >= entry.syncRev) {
                continue;
            }

            const { documentId, driveId, scope, branch } = entry.syncUnit;
            const operations = await this.drive.getOperationData(
                entry.driveId,
                entry.syncId,
                {
                    since,
                    fromRevision: entry.listenerRev
                }
            );
            strands.push({
                driveId,
                documentId,
                scope: scope as OperationScope,
                branch,
                operations
            });
        }

        return strands;
    }
}

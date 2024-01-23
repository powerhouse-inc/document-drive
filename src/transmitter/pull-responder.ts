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
        const entries = this.manager.getListener(
            this.listener.driveId,
            listenerId
        );

        // fetch operations from drive  and prepare strands
        const strands: StrandUpdate[] = [];

        for (const entry of entries.syncUnits) {
            if (entry.listenerRev >= entry.syncRev) {
                continue;
            }

            const { documentId, driveId, scope, branch } = entry;
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

    async acknowledgeStrands(
        driveId: string,
        listenerId: string,
        revisions: ListenerRevision[]
    ): Promise<boolean> {
        const listener = this.manager.getListener(
            this.listener.driveId,
            listenerId
        );
        let success = true;
        for (const revision of revisions) {
            const syncId = listener.syncUnits.find(
                s => s.scope === revision.scope && s.branch === revision.branch
            )?.syncId;
            if (!syncId) {
                success = false;
                continue;
            }

            await this.manager.updateListenerRevision(
                listenerId,
                driveId,
                syncId,
                revision.revision
            );
        }

        return success;
    }

    static pullStrands(
        driveId: string,
        remoteUrl: string,
        listenerId: string,
        since?: string
    ) {
        // TODO fetch strands
    }
}

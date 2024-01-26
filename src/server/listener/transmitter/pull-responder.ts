import { ListenerFilter } from 'document-model-libs/document-drive';
import { OperationScope } from 'document-model/document';
import request, { gql } from 'graphql-request';
import {
    BaseDocumentDriveServer,
    Listener,
    ListenerRevision,
    StrandUpdate
} from '../../types';
import { ListenerManager } from '../manager';
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
        const listener = this.manager.getListener(driveId, listenerId);
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

    static async registerPullResponder(
        driveId: string,
        remoteUrl: string,
        filter: ListenerFilter
    ): Promise<Listener['listenerId']> {
        // graphql request to switchboard
        const { registerPullResponderListener } = await request<{
            registerPullResponderListener: {
                listenerId: Listener['listenerId'];
            };
        }>(
            `${remoteUrl}/${driveId}/graphql`,
            gql`
                mutation registerPullResponderListener(
                    $filter: InputListenerFilter!
                ) {
                    registerPullResponderListener(filter: $filter) {
                        listenerId
                    }
                }
            `,
            { filter }
        );
        return registerPullResponderListener.listenerId;
    }

    static async pullStrands(
        driveId: string,
        remoteUrl: string,
        listenerId: string,
        since?: string // TODO add support for since
    ): Promise<StrandUpdate[]> {
        const { strands } = await request<{ strands: StrandUpdate[] }>(
            `${remoteUrl}/${driveId}/graphql`,
            gql`
                query strands($listenerId: ID!) {
                    strands(listenerId: $listenerId) {
                        driveId
                        documentId
                        scope
                        branch
                        operations {
                            revision
                            skip
                            name
                            inputJson
                            stateHash
                        }
                    }
                }
            `,
            { listenerId }
        );
        return strands;
    }
}

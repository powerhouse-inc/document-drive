import { ListenerFilter, Trigger, z } from 'document-model-libs/document-drive';
import { Operation, OperationScope } from 'document-model/document';
import { PULL_DRIVE_INTERVAL } from '../..';
import { gql, requestGraphql } from '../../../utils/graphql';
import { OperationError } from '../../error';
import {
    BaseDocumentDriveServer,
    IOperationResult,
    Listener,
    ListenerRevision,
    OperationUpdate,
    StrandUpdate
} from '../../types';
import { ListenerManager } from '../manager';
import { ITransmitter, PullResponderTrigger } from './types';

export type OperationUpdateGraphQL = Omit<OperationUpdate, 'input'> & {
    input: string;
};

export type StrandUpdateGraphQL = Omit<StrandUpdate, 'operations'> & {
    operations: OperationUpdateGraphQL[];
};

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

    async processAcknowledge(
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
        url: string,
        filter: ListenerFilter
    ): Promise<Listener['listenerId']> {
        // graphql request to switchboard
        const { registerPullResponderListener } = await requestGraphql<{
            registerPullResponderListener: {
                listenerId: Listener['listenerId'];
            };
        }>(
            url,
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
        url: string,
        listenerId: string,
        since?: string // TODO add support for since
    ): Promise<StrandUpdate[]> {
        const { strands } = await requestGraphql<{
            strands: StrandUpdateGraphQL[];
        }>(
            url,
            gql`
                query strands($listenerId: ID!) {
                    strands(listenerId: $listenerId) {
                        driveId
                        documentId
                        scope
                        branch
                        operations {
                            timestamp
                            skip
                            type
                            input
                            hash
                            index
                        }
                    }
                }
            `,
            { listenerId }
        );
        return strands.map(s => ({
            ...s,
            operations: s.operations.map(o => ({
                ...o,
                input: JSON.parse(o.input)
            }))
        }));
    }

    static async acknowledgeStrands(
        driveId: string,
        url: string,
        listenerId: string,
        revisions: ListenerRevision[]
    ): Promise<boolean> {
        const result = await requestGraphql<boolean>(
            url,
            gql`
                mutation acknowledge(
                    $listenerId: String!
                    $revisions: [ListenerRevisionInput]
                ) {
                    acknowledge(listenerId: $listenerId, revisions: $revisions)
                }
            `,
            { listenerId, revisions }
        );
        return result;
    }

    static async setupPull(
        driveId: string,
        trigger: PullResponderTrigger,
        onStrandUpdate: (strand: StrandUpdate) => Promise<IOperationResult>,
        onError: (error: Error) => void,
        onAcknowledge?: (success: boolean) => void
    ): Promise<number> {
        const { url, listenerId, interval } = trigger.data;
        let loopInterval = PULL_DRIVE_INTERVAL;
        if (interval) {
            try {
                const intervalNumber = parseInt(interval);
                if (intervalNumber) {
                    loopInterval = intervalNumber;
                }
            } catch {
                // ignore invalid interval
            }
        }

        const timeout = setInterval(async () => {
            try {
                const strands = await PullResponderTransmitter.pullStrands(
                    driveId,
                    url,
                    listenerId
                    // since ?
                );

                const listenerRevisions: ListenerRevision[] = [];

                for (const strand of strands) {
                    const operations: Operation[] = strand.operations.map(
                        ({ index, type, hash, input, skip, timestamp }) => ({
                            index,
                            type,
                            hash,
                            input,
                            skip,
                            timestamp,
                            scope: strand.scope,
                            branch: strand.branch
                        })
                    );

                    let error: Error | undefined = undefined;

                    try {
                        const result = await onStrandUpdate(strand);
                        if (result.error) {
                            throw result.error;
                        }
                    } catch (e) {
                        error = e as Error;
                        onError?.(error);
                    }

                    listenerRevisions.push({
                        branch: strand.branch,
                        documentId: strand.documentId ?? '',
                        driveId: strand.driveId,
                        revision: operations.pop()?.index ?? -1,
                        scope: strand.scope as OperationScope,
                        status: error
                            ? error instanceof OperationError
                                ? error.status
                                : 'ERROR'
                            : 'SUCCESS'
                    });

                    // TODO: Should try to parse remaining strands?
                    if (error) {
                        break;
                    }
                }

                const ackRequest =
                    await PullResponderTransmitter.acknowledgeStrands(
                        driveId,
                        url,
                        listenerId,
                        listenerRevisions
                    );
                onAcknowledge?.(ackRequest);
            } catch (error) {
                onError(error as Error);
            }
        }, loopInterval);
        return timeout as unknown as number;
    }

    static isPullResponderTrigger(
        trigger: Trigger
    ): trigger is PullResponderTrigger {
        return (
            trigger.type === 'PullResponder' &&
            z.PullResponderTriggerDataSchema().safeParse(trigger.data).success
        );
    }
}

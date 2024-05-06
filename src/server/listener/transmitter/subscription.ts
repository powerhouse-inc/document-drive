import { Client, createClient, type SubscribePayload } from 'graphql-ws';
import WebSocket from 'isomorphic-ws';
import { logger } from '../../../utils/logger';
import {
    IOperationResult,
    Listener,
    ListenerRevision,
    ListenerRevisionWithError,
    RemoteDriveOptions,
    StrandUpdate
} from '../../types';
import { ListenerManager } from '../manager';
import { ITriggerTransmitter, SubscriptionTrigger } from './types';
import { ListenerFilter, Trigger, z } from 'document-model-libs/document-drive';
import { gql, requestGraphql } from '../../../utils/graphql';
import { generateUUID } from '../../../utils';
import { OperationScope } from 'document-model/document';
import { OperationError } from '../../error';
import { StrandUpdateGraphQL } from './pull-responder';


export class SubscriptionTransmitter implements ITriggerTransmitter {
    private _strands: StrandUpdate[] = [];
    private listener: Listener;
    private manager: ListenerManager;
    private _init: Promise<StrandUpdate[]>;
    private handler: ((strands: StrandUpdate[]) => void) | null = null;

    constructor(
        listener: Listener,
        manager: ListenerManager,
    ) {
        this.listener = listener;
        this.manager = manager;
        console.log("CONSTRUCTOR", listener.listenerId);
        this._init = this.#refreshStrands();
    }

    #updateStrands(strands: StrandUpdate[]): void {
        this._strands = strands;
        this.handler?.(strands);
    }

    async #refreshStrands() {
        const strands = await this.manager.getStrands(
            this.listener.driveId,
            this.listener.listenerId
        );
        console.log("REFRESH", strands.map(s => s.operations.length));
        this.#updateStrands(strands);
        return Promise.resolve(strands);
    }

    async init() {
        return this._init;
    }

    async * strandsGenerator(since?: number): AsyncGenerator<StrandUpdate[]> {
        let waitHandler = null;
        let firstTime = true;
        // eslint-disable-next-line
        while (true) {
            if (waitHandler) {
                await waitHandler;
            }
            waitHandler = new Promise<StrandUpdate[]>(resolve => {
                this.handler = resolve;
            });

            // only return empty array on first call
            if (this._strands.length || firstTime) {
                firstTime = false;
                // TODO add support for 'since' parameter
                yield this._strands.slice();
            }
        }
    }

    async transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        console.log("transmit", strands.map(s => s.operations.length));
        this.#updateStrands([...this._strands, ...strands]);
        return Promise.resolve([]);
    }

    async processAcknowledge(
        driveId: string,
        listenerId: string,
        revisions: ListenerRevision[]
    ): Promise<boolean> {
        const syncUnits = await this.manager.getListenerSyncUnits(
            driveId,
            listenerId
        );
        let success = true;
        let acknowledged = false;
        for (const revision of revisions) {
            const syncUnit = syncUnits.find(
                s =>
                    s.scope === revision.scope &&
                    s.branch === revision.branch &&
                    s.driveId === revision.driveId &&
                    s.documentId == revision.documentId
            );
            if (!syncUnit) {
                logger.warn(
                    'Unknown sync unit was acknowledged',
                    revision
                );
                success = false;
                continue;
            }

            await this.manager.updateListenerRevision(
                listenerId,
                driveId,
                syncUnit.syncId,
                revision.revision
            );
            acknowledged = true;
        }
        if (acknowledged) {
            console.log("processAcknowledge");
            await this.#refreshStrands();
        }

        return success;
    }

    static async registerSubscription(
        driveId: string,
        url: string,
        filter: ListenerFilter
    ): Promise<Listener['listenerId']> {
        // graphql request to switchboard
        const { registerListener } = await requestGraphql<{
            registerListener: {
                listenerId: Listener['listenerId'];
            };
        }>(
            url,
            gql`
                mutation registerListener(
                    $filter: InputListenerFilter!
                    $type: TransmitterType!
                ) {
                    registerListener(filter: $filter, type: $type) {
                        listenerId
                    }
                }
            `,
            { filter, type: 'Subscription' }
        );
        return registerListener.listenerId;
    }

    static async createTrigger(
        driveId: string,
        url: string,
        options: Pick<RemoteDriveOptions, 'pullFilter'>
    ): Promise<Trigger> {
        const { pullFilter } = options;
        const listenerId = await SubscriptionTransmitter.registerSubscription(
            driveId,
            url,
            pullFilter ?? {
                documentId: ['*'],
                documentType: ['*'],
                branch: ['*'],
                scope: ['*']
            }
        );

        const trigger: Trigger = {
            id: generateUUID(),
            type: 'Subscription',
            data: {
                url,
                listenerId,
            }
        };
        return trigger;
    }

    static isTrigger(
        trigger: Trigger
    ): trigger is SubscriptionTrigger {
        return (
            trigger.type === 'Subscription' &&
            z.SubscriptionTriggerDataSchema().safeParse(trigger.data).success
        );
    }

    static async setup(driveId: string,
        trigger: SubscriptionTrigger,
        onStrandUpdate: (strand: StrandUpdate) => Promise<IOperationResult>,
        onError: (error: Error) => void,
        onRevisions?: (revisions: ListenerRevisionWithError[]) => void,
        onAcknowledge?: (success: boolean) => void) {

        const { url, listenerId } = trigger.data;
        let subscriptionUrl = url.replace("http", "ws")
        subscriptionUrl += subscriptionUrl.endsWith("/") ? "ws" : "/ws";

        const client = createClient({
            url: subscriptionUrl,
            webSocketImpl: WebSocket,
        });
        try {
            const subscription = client.iterate<{ subscribeStrands: StrandUpdateGraphQL[] }>({
                query: `
                subscription($listenerId: ID) {
                    subscribeStrands(listenerId: $listenerId) {
                    branch
                    documentId
                    driveId
                    operations {
                        timestamp
                        skip
                        type
                        input
                        hash
                        index
                        context {
                            signer {
                                user {
                                    address
                                    networkId
                                    chainId
                                }
                                app {
                                    name
                                    key
                                }
                                signature
                            }
                        }
                    }
                    scope
                    }
                }`,
                variables: {
                    listenerId,
                }
            });
            for await (const { errors, data } of subscription) {
                const error = errors?.at(0);
                if (error) {
                    onError(error);
                } else {
                    const strands = data?.subscribeStrands ?? [];
                    console.log("NEW STRANDS", strands.map(s => s.operations.length));
                    SubscriptionTransmitter.saveStrands(trigger, client, strands, onStrandUpdate, onError, onRevisions, onAcknowledge).catch(onError);
                }
                return;
            }
            return () => subscription.return?.();
        } catch (error) {
            onError(error as Error);
        }
    }

    static async saveStrands(
        trigger: SubscriptionTrigger,
        client: Client,
        strandsQL: StrandUpdateGraphQL[],
        onStrandUpdate: (strand: StrandUpdate) => Promise<IOperationResult>,
        onError: (error: Error) => void,
        onRevisions?: (revisions: ListenerRevisionWithError[]) => void,
        onAcknowledge?: (success: boolean) => void) {
        const strands = strandsQL.map(s => ({
            ...s,
            operations: s.operations.map(o => ({
                ...o,
                scope: s.scope,
                branch: s.branch,
                input: JSON.parse(o.input) as object
            }))
        }));
        // if there are no new strands then do nothing
        if (!strands.length) {
            onRevisions?.([]);
            return;
        }

        const listenerRevisions: ListenerRevisionWithError[] = [];


        for (const strand of strands) {
            let error: Error | undefined = undefined;
            let result: IOperationResult | undefined = undefined;
            try {
                result = await onStrandUpdate(strand);
                if (result.error) {
                    throw result.error;
                }
            } catch (e) {
                error = e as Error;
                onError(error);
            }

            listenerRevisions.push({
                branch: strand.branch,
                documentId: strand.documentId || '',
                driveId: strand.driveId,
                revision: result?.document?.operations[strand.scope]?.at(-1)?.index ?? -1,
                scope: strand.scope as OperationScope,
                status: error
                    ? error instanceof OperationError
                        ? error.status
                        : 'ERROR'
                    : 'SUCCESS',
                error
            });
        }

        onRevisions?.(listenerRevisions);

        await SubscriptionTransmitter.acknowledgeStrands(
            client,
            trigger.data.listenerId,
            listenerRevisions.map(revision => {
                const { error, ...rest } = revision;
                return rest;
            })
        )
            .then(result => onAcknowledge?.(result))
            .catch(error => logger.error('ACK error', error));
    }

    static async acknowledgeStrands(
        client: Client,
        listenerId: string,
        revisions: ListenerRevision[]
    ): Promise<boolean> {
        const subscription = client.iterate<{ acknowledge: boolean }>({
            query: `
            mutation acknowledge(
                $listenerId: String!
                $revisions: [ListenerRevisionInput]
            ) {
                acknowledge(listenerId: $listenerId, revisions: $revisions)
            }
        `,
            variables: { listenerId, revisions }
        });
        const result = await subscription.next();

        return result.value.acknowledge as boolean;
    }
}

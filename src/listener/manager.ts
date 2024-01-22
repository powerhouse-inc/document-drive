import { ListenerCallInfo } from 'document-model-libs/document-drive';
import { OperationScope } from 'document-model/document';
import {
    BaseListenerManager,
    Listener,
    ListenerFilter,
    ListenerState,
    ListenerStatus,
    SynchronizationUnit
} from '../server/types';
import { SwitchboardPushTransmitter } from '../transmitter/switchboard-push';
import { ITransmitter } from '../transmitter/types';

export class ListenerManager extends BaseListenerManager {
    async getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined> {
        return this.transmitters[driveId]?.[listenerId];
    }

    async addListener(listener: Listener) {
        const drive = listener.driveId;

        //TODO: should sync unit contain documentType?
        const syncUnits = await this.drive.getSynchronizationUnits(drive);
        for (const syncUnit of syncUnits) {
            if (this._checkFilter(listener.filter, syncUnit)) {
                this.listenerState.push({
                    driveId: syncUnit.driveId,
                    block: listener.block,
                    listenerId: listener.listenerId,
                    listenerRev: 0,
                    listenerStatus: ListenerStatus.CREATED,
                    syncId: syncUnit.syncId,
                    syncRev: syncUnit.revision,
                    pendingTimeout: '0',
                    listener,
                    syncUnit
                });
            }
        }
        let transmitter: ITransmitter | undefined;

        switch (listener.callInfo?.transmitterType) {
            case 'SwitchboardPush': {
                transmitter = new SwitchboardPushTransmitter(
                    this.drive,
                    listener
                );
                break;
            }
        }

        if (transmitter) {
            const driveTransmitters = this.transmitters[drive] || {};
            driveTransmitters[listener.listenerId] = transmitter;
            this.transmitters[drive] = driveTransmitters;
            return transmitter;
        }
    }

    async removeListener(listenerId: string) {
        let removed = false;
        this.listenerState = this.listenerState.filter(e => {
            const remove = e.listenerId === listenerId;
            if (remove) {
                removed = true;
            }
            return !remove;
        });
        return removed;
    }

    async updateSynchronizationRevision(
        driveId: string,
        syncId: string,
        syncRev: number
    ) {
        for (const entry of this.listenerState) {
            if (entry.driveId !== driveId || entry.syncUnit.syncId !== syncId) {
                continue;
            }

            entry.syncRev = syncRev;
            entry.syncUnit.lastUpdated = new Date().toISOString();

            if (entry.listenerRev >= entry.syncRev) {
                entry.listenerStatus = ListenerStatus.SUCCESS;
                continue;
            }
        }
    }

    async updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void> {
        const entry = this.listenerState.find(
            e =>
                e.listenerId === listenerId &&
                e.driveId === driveId &&
                e.syncUnit.syncId === syncId
        );
        if (entry) {
            entry.listenerRev = listenerRev;
        }
    }

    async triggerUpdate() {
        for (const listener of this.listenerState) {
            if (listener.listenerRev < listener.syncRev) {
                const {
                    driveId,
                    listenerId,
                    listenerRev,
                    syncId,
                    syncUnit: { documentId, scope, branch }
                } = listener;
                const transmitter = await this.getTransmitter(
                    driveId,
                    listenerId
                );
                if (!transmitter) {
                    continue;
                }

                // TODO retrieve strands from listenerRev to syncRev
                const operations = await this.drive.getOperationData(
                    driveId,
                    syncId,
                    {
                        fromRevision: listenerRev
                    }
                );

                try {
                    listener.listenerStatus = ListenerStatus.PENDING;
                    listener.pendingTimeout = new Date(
                        new Date().getTime() / 1000 +
                        300
                    ).toISOString();
                    const listenerRevisions = await transmitter?.transmit([
                        {
                            driveId,
                            documentId,
                            scope: scope as OperationScope,
                            branch,
                            operations
                        }]
                    );
                    listener.pendingTimeout = '0';
                    listener.listenerStatus = ListenerStatus.SUCCESS;
                    listener.listenerRev = listenerRevision;
                } catch (e) {
                    listener.pendingTimeout = '0';
                    listener.listenerStatus = ListenerStatus.ERROR;
                } finally {
                    listener.listenerStatus = ListenerStatus.
                }
            }
        }
    }

    private _checkFilter(
        filter: ListenerFilter,
        syncUnit: SynchronizationUnit
    ) {
        const { branch, documentId, scope, documentType } = syncUnit;
        // TODO: Needs to be optimized
        if (
            (!filter.branch ||
                filter.branch.includes(branch) ||
                filter.branch.includes('*')) &&
            (!filter.documentId ||
                filter.documentId.includes(documentId) ||
                filter.documentId.includes('*')) &&
            (!filter.scope ||
                filter.scope.includes(scope) ||
                filter.scope.includes('*')) &&
            (!filter.documentType ||
                filter.documentType.includes(documentType) ||
                filter.documentType.includes('*'))
        ) {
            return true;
        }
        return false;
    }

    async init() {
        if (this.listenerState.length !== 0) {
            this.listenerState = [];
        }

        const drives = await this.drive.getDrives();
        for (const driveId of drives) {
            const drive = await this.drive.getDrive(driveId);
            const {
                state: {
                    local: { listeners }
                }
            } = drive;

            for (const listener of listeners) {
                this.addListener({
                    block: listener.block,
                    driveId,
                    filter: {
                        branch: listener.filter.branch ?? [],
                        documentId: listener.filter.documentId ?? [],
                        documentType: listener.filter.documentType,
                        scope: listener.filter.scope ?? []
                    },
                    listenerId: listener.listenerId,
                    system: listener.system,
                    callInfo:
                        (listener.callInfo as ListenerCallInfo) ?? undefined,
                    label: listener.label ?? ''
                });
            }
        }
    }

    async getListener(id: string) {
        const listener = await this.listenerState.find(
            e => e.listenerId === id
        );
        return listener;
    }

    getCacheEntries(listenerId: string): ListenerState[] {
        return this.listenerState.filter(e => e.listenerId === listenerId);
    }
}

import { ListenerCallInfo } from 'document-model-libs/document-drive';
import {
    BaseListenerManager,
    Listener,
    ListenerFilter,
    ListenerState,
    ListenerStatus,
    SynchronizationUnit
} from '../server/types';
import { SwitchboardPushTransmitter } from '../transmitter/switchboard-push';

export class ListenerManager extends BaseListenerManager {
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

            if (
                entry.listener.callInfo?.transmitterType === 'SwitchboardPush'
            ) {
                try {
                    entry.listenerStatus = ListenerStatus.PENDING;
                    entry.pendingTimeout = (
                        new Date().getTime() / 1000 +
                        300
                    ).toString();
                    await SwitchboardPushTransmitter.pushStrands(this.drive, [
                        {
                            branch: 'main',
                            documentId: '1',
                            driveId: '1',
                            operations: [
                                {
                                    hash: '1',
                                    index: 1,
                                    input: {},
                                    scope: 'global',
                                    skip: 0,
                                    timestamp: new Date().toISOString(),
                                    type: 'create'
                                }
                            ],
                            scope: 'global'
                        }
                    ]);
                    entry.pendingTimeout = '0';
                    entry.listenerStatus = ListenerStatus.SUCCESS;
                } catch (e) {
                    entry.pendingTimeout = '0';
                    entry.listenerStatus = ListenerStatus.ERROR;
                }
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

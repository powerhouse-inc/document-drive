import { ListenerCallInfo } from 'document-model-libs/document-drive';
import { OperationScope } from 'document-model/document';
import {
    BaseListenerManager,
    Listener,
    ListenerFilter,
    ListenerState,
    ListenerStatus,
    StrandUpdate,
    SynchronizationUnit
} from '../types';
import { PullResponderTransmitter } from './transmitter';
import { SwitchboardPushTransmitter } from './transmitter/switchboard-push';
import { ITransmitter } from './transmitter/types';

export class ListenerManager extends BaseListenerManager {
    async getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined> {
        return this.transmitters[driveId]?.[listenerId];
    }

    async addListener(listener: Listener) {
        const drive = listener.driveId;

        const syncUnits = await this.drive.getSynchronizationUnits(drive);
        const filteredSyncUnits = [];
        for (const syncUnit of syncUnits) {
            if (this._checkFilter(listener.filter, syncUnit)) {
                filteredSyncUnits.push(syncUnit);
            }
        }

        if (!this.listenerState.has(drive)) {
            this.listenerState.set(drive, new Map());
        }

        const driveMap = this.listenerState.get(drive)!;

        driveMap.set(listener.listenerId, {
            block: listener.block,
            driveId: listener.driveId,
            pendingTimeout: '0',
            listener,
            listenerStatus: ListenerStatus.CREATED,
            syncUnits: filteredSyncUnits.map(e => ({
                ...e,
                listenerRev: 0,
                syncRev: e.revision
            }))
        });

        let transmitter: ITransmitter | undefined;

        switch (listener.callInfo?.transmitterType) {
            case 'SwitchboardPush': {
                transmitter = new SwitchboardPushTransmitter(
                    listener,
                    this.drive
                );
                break;
            }

            case 'PullResponder': {
                transmitter = new PullResponderTransmitter(
                    listener,
                    this.drive,
                    this
                );
            }
        }

        if (!transmitter) {
            throw new Error('Transmitter not found');
        }

        const driveTransmitters = this.transmitters[drive] || {};
        driveTransmitters[listener.listenerId] = transmitter;
        this.transmitters[drive] = driveTransmitters;
        return transmitter;
    }

    async removeListener(driveId: string, listenerId: string) {
        const driveMap = this.listenerState.get(driveId);
        if (!driveMap) {
            return false;
        }

        return driveMap.delete(listenerId);
    }

    async updateSynchronizationRevision(
        driveId: string,
        syncId: string,
        syncRev: number
    ) {
        const drive = this.listenerState.get(driveId);
        if (!drive) {
            return;
        }
        for (const [, listener] of drive) {
            const syncUnits = listener.syncUnits.filter(
                e => e.syncId === syncId
            );
            if (listener.driveId !== driveId) {
                continue;
            }

            for (const syncUnit of syncUnits) {
                if (syncUnit.syncId !== syncId) {
                    continue;
                }

                syncUnit.syncRev = syncRev;
                syncUnit.lastUpdated = new Date().toISOString();
            }
        }
    }

    async updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void> {
        const drive = this.listenerState.get(driveId);
        if (!drive) {
            return;
        }

        const listener = drive.get(listenerId);
        if (!listener) {
            return;
        }

        const entry = listener.syncUnits.find(s => s.syncId === syncId);
        if (entry) {
            entry.listenerRev = listenerRev;
            entry.lastUpdated = new Date().toISOString();
        }
    }

    async triggerUpdate() {
        for (const [driveId, drive] of this.listenerState) {
            for (const [id, listener] of drive) {
                const transmitter = await this.getTransmitter(driveId, id);
                if (!transmitter) {
                    continue;
                }

                const strandUpdates: StrandUpdate[] = [];
                for (const unit of listener.syncUnits) {
                    if (unit.listenerRev >= unit.syncRev) {
                        continue;
                    }

                    const opData = await this.drive.getOperationData(
                        driveId,
                        unit.syncId,
                        {
                            fromRevision: unit.listenerRev
                        }
                    );

                    strandUpdates.push({
                        ...unit,
                        operations: opData,
                        scope: unit.scope as OperationScope,
                        branch: unit.branch
                    });
                }

                if (strandUpdates.length == 0) {
                    continue;
                }

                listener.pendingTimeout = new Date(
                    new Date().getTime() / 1000 + 300
                ).toISOString();

                listener.listenerStatus = ListenerStatus.PENDING;
                listener.pendingTimeout = new Date(
                    new Date().getTime() / 1000 + 300
                ).toISOString();

                try {
                    const listenerRevisions =
                        await transmitter?.transmit(strandUpdates);
                    if (!listenerRevisions) {
                        throw new Error("Couldn't update listener revision");
                    }

                    listener.pendingTimeout = '0';
                    listener.listenerStatus = ListenerStatus.PENDING;

                    for (const unit of listener.syncUnits) {
                        const revision = listenerRevisions.find(
                            e =>
                                e.documentId === unit.documentId &&
                                e.scope === unit.scope &&
                                e.branch === unit.branch
                        );
                        if (!revision) {
                            continue;
                        }

                        unit.listenerRev = revision.revision;
                    }
                } catch (e) {
                    listener.listenerStatus = ListenerStatus.ERROR;
                } finally {
                    listener.listenerStatus = ListenerStatus.CREATED;
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

    getListener(driveId: string, listenerId: string): ListenerState {
        const drive = this.listenerState.get(driveId);
        if (!drive) throw new Error('Drive not found');
        const listener = drive.get(listenerId);
        if (!listener) throw new Error('Listener not found');
        return listener;
    }
}
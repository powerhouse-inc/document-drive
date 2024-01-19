import { FileNode, ListenerCallInfo } from 'document-model-libs/document-drive';
import {
    BaseListenerManager,
    Listener,
    ListenerFilter,
    ListenerStateCacheEntry,
    ListenerStatus,
    SynchronizationUnit
} from './types';

export class ListenerManager extends BaseListenerManager {
    async addListener(listener: Listener) {
        const { documentId, scope, branch } = listener.filter;
        const syncUnits = await this.drive.getSynchronizationUnits(
            listener.driveId,
            documentId,
            scope,
            branch
        );
        for (const syncUnit of syncUnits) {
            if (this._checkFilter(listener.filter, syncUnit)) {
                this.cache.push({
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
        this.cache = this.cache.filter(e => {
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
        for (const entry of this.cache) {
            if (entry.driveId === driveId && entry.syncUnit.syncId === syncId) {
                entry.syncRev = syncRev;
            }
        }
    }

    async updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void> {
        const entry = this.cache.find(
            e =>
                e.listenerId === listenerId &&
                e.driveId === driveId &&
                e.syncUnit.syncId === syncId
        );
        if (entry) {
            entry.listenerRev = listenerRev;
        }
    }

    private async _getAllSyncUnits() {
        const syncUnits: SynchronizationUnit[] = [];
        const drives = await this.drive.getDrives();
        for (const driveId of drives) {
            const drive = await this.drive.getDrive(driveId);
            for (const node of drive.state.global.nodes.filter(
                n => n.kind === 'file'
            ) as FileNode[]) {
                syncUnits.push({
                    driveId: driveId,
                    syncId: node.id,
                    documentId: node.id,
                    scope: 'global',
                    branch: 'main',
                    revision: 0,
                    documentType: node.documentType,
                    lastUpdated: new Date().toISOString()
                });
            }
        }

        return syncUnits;
    }

    private async _getAllListeners() {
        const listeners: Listener[] = [];
        const drives = await this.drive.getDrives();
        for (const driveId of drives) {
            const drive = await this.drive.getDrive(driveId);
            for (const listener of drive.state.local.listeners) {
                listeners.push({
                    ...listener,
                    driveId: drive.state.global.id,
                    label: listener.label ? listener.label : '',
                    filter: {
                        branch: listener.filter.branch ?? [],
                        documentId: listener.filter.documentId ?? [],
                        documentType: listener.filter.documentType,
                        scope: listener.filter.scope ?? []
                    },
                    callInfo: listener.callInfo as ListenerCallInfo
                });
            }
        }

        return listeners;
    }

    private _checkFilter(
        filter: ListenerFilter,
        syncUnit: SynchronizationUnit
    ) {
        const { branch, documentId, scope, documentType } = syncUnit;
        // TODO: Needs to be optimized
        if (
            (!filter.branch || filter.branch.includes(branch)) &&
            (!filter.documentId || filter.documentId.includes(documentId)) &&
            (!filter.scope || filter.scope.includes(scope)) &&
            (!filter.documentType || filter.documentType.includes(documentType))
        ) {
            return true;
        }
        return false;
    }

    async init() {
        if (this.cache.length !== 0) {
            this.cache = [];
        }

        const syncUnits = await this._getAllSyncUnits();
        const listeners = await this._getAllListeners();
        for (const listener of listeners) {
            const { listenerId, filter, block } = listener;

            for (const syncUnit of syncUnits) {
                if (this._checkFilter(filter, syncUnit)) {
                    this.cache.push({
                        driveId: syncUnit.driveId,
                        block,
                        listenerId,
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
    }

    async getListener(id: string) {
        const listener = await this.cache.find(e => e.listenerId === id);
        return listener;
    }

    getCacheEntries(listenerId: string): ListenerStateCacheEntry[] {
        return this.cache.filter(e => e.listenerId === listenerId);
    }
}

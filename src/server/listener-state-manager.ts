import { FileNode, ListenerCallInfo } from 'document-model-libs/document-drive';
import { Operation } from 'document-model/document';
import { DocumentDriveServer, IDriveStorage } from '..';
import {
    Listener,
    ListenerFilter,
    ListenerStateCacheEntry,
    ListenerStatus,
    SynchronizationUnit
} from './types';

export class ListenerStateManager {
    protected cache: ListenerStateCacheEntry[] = [];

    private db: IDriveStorage;
    private drive: DocumentDriveServer;

    constructor(storage: IDriveStorage, drive: DocumentDriveServer) {
        this.db = storage;
        this.drive = drive;
    }

    async addListener(listener: Listener) {
        const syncUnits = await this._getSyncUnits(listener);
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
        this.cache = this.cache.filter(e => e.listenerId !== listenerId);
    }

    async updateCache(
        driveId: string,
        documentId: string,
        operations: Operation[]
    ) {
        for (const operation of operations) {
            const scope = operation.scope;
            const branch = 'main';

            const syncUnits = await this.drive.getSynchronizationUnits(
                driveId,
                documentId,
                scope,
                branch
            );
            const syncUnitIds = syncUnits.map(e => e.syncId);

            this.cache.forEach((e, i) => {
                if (!syncUnitIds.includes(e.syncId)) return;
                this.cache[i]!.syncRev = operation.index;
                this.cache[i]!.pendingTimeout = (
                    new Date().getTime() / 1000 +
                    300
                ).toString();

                this.cache[i]!.listenerStatus = ListenerStatus.PENDING;
            });
        }
    }

    // @todo: needs to be implemtend
    private async _getSyncUnits(
        listener: Listener
    ): Promise<SynchronizationUnit[]> {
        const drives = await this.drive.getDrives();
        // for (const drive of drives) {
        //     this.drive.ge;
        // }

        return [];
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

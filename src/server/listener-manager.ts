import { IDriveStorage } from '..';
import { CacheEntry, Listener, ListenerStatus } from './types';

export class ListenerManager {
    private cache: CacheEntry[] = [];
    private storage: IDriveStorage;

    constructor(storage: IDriveStorage) {
        this.storage = storage;
    }

    async addListener(listener: Listener) {
        const syncUnits = await this.storage.getSyncUnits();
        syncUnits.forEach(syncUnit => {
            const { branch, documentId, scope, documentType } = syncUnit;
            if (
                listener.filter.branch.includes(branch) &&
                listener.filter.documentId.includes(documentId) &&
                listener.filter.scope.includes(scope) &&
                listener.filter.documentType.includes(documentType)
            ) {
                this.cache.push({
                    block: listener.block,
                    listenerId: listener.listenerId,
                    listenerRev: 0,
                    listenerStatus: ListenerStatus.CREATED,
                    syncId: syncUnit.syncId,
                    syncRev: syncUnit.revision,
                    pendingTimeout: '0'
                });
            }
        });
    }

    async setup() {
        // fetch sync units and listener from storage
        if (this.cache.length !== 0) {
            this.cache = [];
        }

        const syncUnits = await this.storage.getSyncUnits();
        const listeners = await this.storage.getListener();
        listeners.forEach(listener => {
            const {
                driveId,
                listenerId,
                filter,
                block,
                system,
                callInfo,
                label
            } = listener;

            syncUnits.forEach(syncUnit => {
                const { branch, documentId, scope, documentType } = syncUnit;
                if (
                    filter.branch.includes(branch) &&
                    filter.documentId.includes(documentId) &&
                    filter.scope.includes(scope) &&
                    filter.documentType.includes(documentType)
                ) {
                    this.cache.push({
                        block,
                        listenerId,
                        listenerRev: 0,
                        listenerStatus: ListenerStatus.CREATED,
                        syncId: syncUnit.syncId,
                        syncRev: syncUnit.revision,
                        pendingTimeout: '0'
                    });
                }
            });
        });
    }

    process() {
      this.cache.forEach(entry => {
        if(entry.listenerRev === entry.syncRev) {
          return;
        }

        if(entry.listenerRev > entry.syncRev) { // listener is ahead of sync
          // pull strands and update cache
        }

        if(entry.listenerRev < entry.syncRev) { // sync is ahead of listener
          // push strands and update cache
        }
      });

    }

    pushStrands(listenerId: string, ) {}

    pullStrands() {}
}

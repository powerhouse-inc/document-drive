import { IDriveStorage } from '..';
import { InternalTransmitter } from '../transmitters/internal';
import { PullResponderTransmitter } from '../transmitters/pull-responder';
import { SwitchboardPushTransmitter } from '../transmitters/switchboard-push';
import {
    CacheEntry,
    Listener,
    ListenerFilter,
    ListenerStatus,
    SynchronizationUnit
} from './types';

export class ListenerManager {
    private cache: CacheEntry[] = [];

    // according to enum value
    private transmitters = [
        InternalTransmitter,
        SwitchboardPushTransmitter,
        PullResponderTransmitter,
        null,
        null,
        null
    ];
    private storage: IDriveStorage;

    constructor(storage: IDriveStorage) {
        this.storage = storage;
    }

    async addListener(listener: Listener) {
        const syncUnits = await this.storage.getSyncUnits();
        for (const syncUnit of syncUnits) {
            if (this.checkFilter(listener.filter, syncUnit)) {
                this.cache.push({
                    block: listener.block,
                    listenerId: listener.listenerId,
                    listenerRev: 0,
                    listenerStatus: ListenerStatus.CREATED,
                    syncId: syncUnit.syncId,
                    syncRev: syncUnit.revision,
                    pendingTimeout: '0',
                    listener
                });
            }
        }

        //TODO: persist Listener in Storage?
    }

    checkFilter(filter: ListenerFilter, syncUnit: SynchronizationUnit) {
        const { branch, documentId, scope, documentType } = syncUnit;
        // TODO: Needs to be optimized
        if (
            filter.branch.includes(branch) &&
            filter.documentId.includes(documentId) &&
            filter.scope.includes(scope) &&
            filter.documentType.includes(documentType)
        ) {
            return true;
        }
        return false;
    }

    async setup() {
        // fetch sync units and listener from storage
        if (this.cache.length !== 0) {
            this.cache = [];
        }

        const syncUnits = await this.storage.getSyncUnits();
        const listeners = await this.storage.getListener();
        for (const listener of listeners) {
            const {
                driveId,
                listenerId,
                filter,
                block,
                system,
                callInfo,
                label
            } = listener;

            for (const syncUnit of syncUnits) {
                if (this.checkFilter(filter, syncUnit)) {
                    this.cache.push({
                        block,
                        listenerId,
                        listenerRev: 0,
                        listenerStatus: ListenerStatus.CREATED,
                        syncId: syncUnit.syncId,
                        syncRev: syncUnit.revision,
                        pendingTimeout: '0',
                        listener
                    });
                }
            }
        }
    }

    async process() {
        for (let i = 0; i < this.cache.length; i++) {
            const entry = this.cache[i];
            const result = await this.processCacheEntry(entry!);
            //TODO: update cache with result
        }
    }

    async processCacheEntry(cacheEntry: CacheEntry) {
        if (cacheEntry.listenerRev === cacheEntry.syncRev) {
            return;
        } else if (cacheEntry.listenerRev < cacheEntry.syncRev) {
            const { data, name, transmitterType } =
                cacheEntry.listener.callInfo!;

            this.transmitters[transmitterType]?.process(
                cacheEntry.listenerId,
                name,
                data
            );
        }
        // sync is ahead of listener
        // push strands and update cache
    }
}

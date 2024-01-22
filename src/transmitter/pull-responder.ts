import {
    BaseDocumentDriveServer,
    BaseListenerManager,
    IDriveStorage,
    StrandUpdate
} from '..';

export class PullResponderTransmitter {
    protected storage: IDriveStorage;
    protected drive: BaseDocumentDriveServer;
    protected listenerManager: BaseListenerManager;
    constructor(
        storage: IDriveStorage,
        drive: BaseDocumentDriveServer,
        listenerManager: BaseListenerManager
    ) {
        this.storage = storage;
        this.drive = drive;
        this.listenerManager = listenerManager;
    }

    async getStrands(
        listenerId: string,
        since?: Date
    ): Promise<StrandUpdate[]> {
        // fetch listenerState from listenerManager
        const entries = this.listenerManager.getListenerState(listenerId);

        // fetch operations from drive  and prepare strands
        const strands: StrandUpdate[] = [];

        return strands;
    }
}

import {
    BaseDocumentDriveServer,
    Listener,
    ListenerRevision,
    StrandUpdate
} from '../../types';
import { ITransmitter } from './types';

export interface IReceiver {
    transmit: (strands: StrandUpdate[]) => Promise<ListenerRevision[]>;
}

export class InternalTransmitter implements ITransmitter {
    private drive: BaseDocumentDriveServer;
    private listener: Listener;
    private receiver: IReceiver | undefined;

    constructor(listener: Listener, drive: BaseDocumentDriveServer) {
        this.listener = listener;
        this.drive = drive;
    }

    async transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        if (!this.receiver) {
            return [];
        }
        return this.receiver.transmit(strands);
    }

    setReceiver(receiver: IReceiver) {
        this.receiver = receiver
    }
}

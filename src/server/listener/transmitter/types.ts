import { ListenerRevision, StrandUpdate } from '../..';

export interface ITransmitter {
    transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]>;
}

export interface InternalTransmitterService extends ITransmitter {
    getName(): string;
}

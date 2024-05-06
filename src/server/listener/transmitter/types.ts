import {
    PullResponderTriggerData,
    SubscriptionTriggerData,
    Trigger
} from 'document-model-libs/document-drive';
import { ListenerRevision, StrandUpdate } from '../..';

export interface ITransmitter {
    transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]>;
    disconnect?(): Promise<void>;
}

export interface ITriggerTransmitter extends ITransmitter {
    processAcknowledge(
        driveId: string,
        listenerId: string,
        revisions: ListenerRevision[]
    ): Promise<boolean>
}

export interface InternalTransmitterService extends ITransmitter {
    getName(): string;
}

export type PullResponderTrigger = Omit<Trigger, 'data' | 'type'> & {
    data: PullResponderTriggerData;
    type: 'PullResponder';
};

export type SubscriptionTrigger = Omit<Trigger, 'data' | 'type'> & {
    data: SubscriptionTriggerData;
    type: 'Subscription';
};

import { gql, request } from 'graphql-request';
import {
    BaseDocumentDriveServer,
    Listener,
    ListenerRevision,
    StrandUpdate
} from '../../types';
import { ITransmitter } from './types';

export class SwitchboardPushTransmitter implements ITransmitter {
    private drive: BaseDocumentDriveServer;
    private listener: Listener;
    private targetURL: string;

    constructor(listener: Listener, drive: BaseDocumentDriveServer) {
        this.listener = listener;
        this.drive = drive;
        this.targetURL = listener.callInfo!.data!;
    }

    async transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        // Send Graphql mutation to switchboard
        const listenerRevisions = await request<ListenerRevision[]>(
            this.targetURL,
            gql`
                mutation pushUpdates($strands: [InputStrandUpdate!]) {
                    pushUpdates(strands: $strands) {
                        driveId
                        documentId
                        scope
                        branch
                        status
                        revision
                    }
                }
            `,
            { strands }
        );

        if (!listenerRevisions) {
            throw new Error("Couldn't update listener revision");
        }

        return listenerRevisions;
    }
}

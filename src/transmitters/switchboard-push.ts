import { gql, request } from 'graphql-request';
import { DocumentDriveServer, ListenerRevision, StrandUpdate } from '..';

export class SwitchboardPushTransmitter {
    protected drive: DocumentDriveServer;

    constructor(drive: DocumentDriveServer) {
        this.drive = drive;
    }

    pushStrands(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
        return Promise.all(
            strands.map(async strand => {
                const driveDoc = await this.drive.getDrive(strand.driveId);
                const baseUrl = driveDoc.state.global.remoteUrl!; // switchboard.powerhouse.xyz

                // Send Graphql mutation to switchboard
                const [listenerRevision] = await request<ListenerRevision[]>(
                    baseUrl,
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
                    { strands: [strand] }
                );

                if (!listenerRevision) {
                    throw new Error("Couldn't update listener revision");
                }

                return listenerRevision;
            })
        );
    }
}

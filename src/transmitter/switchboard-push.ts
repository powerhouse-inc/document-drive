import { gql, request } from 'graphql-request';
import { BaseDocumentDriveServer, ListenerRevision, StrandUpdate } from '..';

export class SwitchboardPushTransmitter {
    static async pushStrands(
        drive: BaseDocumentDriveServer,
        strands: StrandUpdate[]
    ): Promise<ListenerRevision[]> {
        console.log('push strands', strands);
        const result = await Promise.all(
            strands.map(async strand => {
                const driveDoc = await drive.getDrive(strand.driveId);
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

        return result;
    }
}

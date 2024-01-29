import request, { gql } from 'graphql-request';

export type DriveInfo = {
    id: string;
    name: string;
    icon?: string;
    remoteUrl?: string;
};

export async function requestPublicDrive(url: string): Promise<DriveInfo> {
    try {
        const { drives } = await request<{ drives: string[] }>(
            url,
            gql`
                {
                    drives
                }
            `
        );
        const driveId = drives.pop();
        if (!driveId) {
            throw new Error('Drive not found');
        }

        const { drive } = await request<{ drive: DriveInfo }>(
            url,
            gql`
            drive(id: $driveId) {
                id
                name
                icon
                remoteUrl
            }
        `,
            { driveId }
        );
        return drive;
    } catch (e) {
        console.error(e);
        throw new Error("Couldn't find drive info");
    }
}

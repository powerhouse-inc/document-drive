import request, { gql } from 'graphql-request';

export type DriveInfo = {
    id: string;
    name: string;
    icon?: string;
    remoteUrl?: string;
};

export async function requestPublicDrive(url: string): Promise<DriveInfo> {
    let drive: DriveInfo;
    try {
        const result = await request<{ drive: DriveInfo }>(
            url,
            gql`
                {
                    drive {
                        id
                        name
                        icon
                        remoteUrl
                    }
                }
            `
        );
        drive = result.drive;
    } catch (e) {
        console.error(e);
        throw new Error("Couldn't find drive info");
    }

    if (!drive) {
        throw new Error('Drive not found');
    }

    return drive;
}

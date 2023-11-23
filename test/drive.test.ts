import * as Lib from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { expect, test } from 'vitest';
import { DocumentDriveServer } from '../src';
import { MemoryStorage } from '../src/storage';

const documentModels = [
    DocumentModelLib,
    ...Object.values(Lib)
] as DocumentModel[];

test('adds drive to server', async () => {
    const server = new DocumentDriveServer(
        documentModels,
        new MemoryStorage() as any
    );
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });

    const drive = await server.getDrive('1');
    expect(drive.state).toStrictEqual({
        id: '1',
        name: 'name',
        icon: 'icon',
        nodes: [],
        remoteUrl: null
    });
});

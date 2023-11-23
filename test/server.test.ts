import {
    utils as DocumentDriveUtils,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as Lib from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
    utils as DocumentModelUtils
} from 'document-model/document-model';
import { expect, test } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage';

const documentModels = [
    DocumentModelLib,
    ...Object.values(Lib)
] as DocumentModel[];

test('adds drive to server', async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });

    const drive = await server.getDrive('1');
    expect(drive.state).toStrictEqual(
        DocumentDriveUtils.createState({
            id: '1',
            name: 'name',
            icon: 'icon'
        })
    );

    const drives = await server.getDrives();
    expect(drives).toStrictEqual(['1']);
});

test('adds file to server', async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });
    let drive = await server.getDrive('1');

    // performs ADD_FILE operation locally
    drive = reducer(
        drive,
        actions.addFile({
            id: '1.1',
            name: 'document 1',
            documentType: 'powerhouse/document-model'
        })
    );

    // dispatches operation to server
    const operation = drive.operations[0]!;
    const serverDrive = await server.addOperation('1', '', operation);

    expect(drive.state).toStrictEqual(serverDrive.state);
    expect(drive.state.nodes).toStrictEqual([
        {
            documentType: 'powerhouse/document-model',
            id: '1.1',
            kind: 'file',
            name: 'document 1',
            parentFolder: null
        }
    ]);
});

test('creates new document of the correct document type when file is added to server', async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });
    let drive = await server.getDrive('1');
    drive = reducer(
        drive,
        actions.addFile({
            id: '1.1',
            name: 'document 1',
            documentType: 'powerhouse/document-model'
        })
    );
    const operation = drive.operations[0]!;
    await server.addOperation('1', '', operation);

    const document = await server.getDocument('1', '1.1');
    expect(document.documentType).toBe('powerhouse/document-model');
    expect(document.state).toStrictEqual(DocumentModelUtils.createState());

    const driveDocuments = await server.getDocuments('1');
    expect(driveDocuments).toStrictEqual(['1.1']);
});

test('deletes file from server', async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });
    let drive = await server.getDrive('1');

    // adds file
    drive = reducer(
        drive,
        actions.addFile({
            id: '1.1',
            name: 'document 1',
            documentType: 'powerhouse/document-model'
        })
    );
    await server.addOperation('1', '', drive.operations[0]!);

    // removes file
    drive = reducer(
        drive,
        actions.deleteNode({
            id: '1.1'
        })
    );
    await server.addOperation('1', '', drive.operations[1]!);

    const serverDrive = await server.getDrive('1');
    expect(serverDrive.state.nodes).toStrictEqual([]);
});

test('deletes document when file is removed from server', async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.addDrive({ id: '1', name: 'name', icon: 'icon' });
    let drive = await server.getDrive('1');
    drive = reducer(
        drive,
        actions.addFile({
            id: '1.1',
            name: 'document 1',
            documentType: 'powerhouse/document-model'
        })
    );
    drive = reducer(
        drive,
        actions.deleteNode({
            id: '1.1'
        })
    );
    await server.addOperation('1', '', drive.operations[0]!);
    await server.addOperation('1', '', drive.operations[1]!);

    const documents = await server.getDocuments('1');
    expect(documents).toStrictEqual([]);

    expect(server.getDocument('1', '1.1')).rejects.toThrowError(
        'Document with id 1.1 not found'
    );
});

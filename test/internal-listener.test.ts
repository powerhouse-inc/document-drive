import { beforeEach, describe, expect, test, vitest } from "vitest";
import { DocumentDriveServer, InternalTransmitter, StrandUpdate } from "../src";
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import * as DocumentDrive from 'document-model-libs/document-drive';
import {
    module as DocumentModelLib,
    actions,
    reducer
} from 'document-model/document-model';
import { DocumentModel } from "document-model/document";
import { buildOperation, buildOperations } from './utils';

describe("Internal Listener", () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    let server = new DocumentDriveServer(documentModels);
    let transmitFn = vitest.fn();
    beforeEach(async () => {
        server = new DocumentDriveServer(documentModels);
        await server.initialize();

        await server.addDrive({
            global: {
                id: "drive",
                name: "Global Drive",
                icon: "",
                slug: "global",
            },
            local: {
                availableOffline: false,
                listeners: [{
                    block: true,
                    callInfo: {
                        data: "",
                        name: "Interal",
                        transmitterType: "Internal"
                    },
                    filter: {
                        branch: ["main"],
                        documentId: ["*"],
                        documentType: ["*"],
                        scope: ["global"]
                    },
                    label: "Internal",
                    listenerId: "internal",
                    system: true,
                }],
                sharingType: "private",
                triggers: [],
            }
        })

        const transmitter = (await server.getTransmitter("drive", "internal")) as InternalTransmitter;
        transmitter.setReceiver({
            transmit: transmitFn
        });

        const drive = await server.getDrive("drive");
        await server.addDriveOperation(
            'drive',
            buildOperation(
                DocumentDrive.reducer,
                drive,
                DocumentDrive.actions.addFile!({
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model',
                    scopes: ['global', 'local']
                })
            )
        );
    });

    test("should call transmit function of listener", async () => {
        const document = await server.getDocument('drive', '1');
        await server.addOperation(
            'drive',
            '1',
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test' })
            )
        );
        expect(transmitFn).toHaveBeenCalledTimes(1);
    });

});
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel, Operation } from 'document-model/document';
import { describe, it } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { PrismaStorage } from '../src/storage/prisma';
import { PrismaClient } from '@prisma/client';
import { actions, reducer } from 'document-model-libs/document-drive';
import { randomUUID } from 'crypto';
import { buildOperation } from './utils';

const documentModels = Object.values(DocumentModelsLibs) as DocumentModel[];

const prismaClient = new PrismaClient({
    log: [
        {
            emit: 'event',
            level: 'query',
        },
        {
            emit: 'stdout',
            level: 'error',
        },
        {
            emit: 'stdout',
            level: 'info',
        },
        {
            emit: 'stdout',
            level: 'warn',
        },
    ],
});


describe('Document Drive Server interaction', () => {

    it('should create remote drive', { timeout: 60000 }, async ({ expect }) => {
        const server = new DocumentDriveServer(documentModels, new PrismaStorage(prismaClient));
        await server.initialize();

        let drive = await server.getDrive("load");

        // prismaClient.$on('query', (e) => {
        //     if (!e.duration) {
        //         return;
        //     }
        //     console.log(`Duration: ${e.duration}ms
        //     Params: ${e.params}
        //     Query: ${e.query}
        //     `);
        // })

        const initialIndex = drive.operations.global.length;
        let index = drive.operations.global.length;
        while (true) {
            console.time("test-" + index);
            const id = randomUUID();

            const action = actions.addFolder({ id, name: "folder" + index });
            drive = reducer(drive, action);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const operation = drive.operations[action.scope]
                .slice()
                .pop()!
            const result = await Promise.all([
                server.addDriveOperation("load", operation),
                // server.addDriveAction("load", actions.addFile({
                //     id: randomUUID(), name: randomUUID(),
                //     documentType: 'powerhouse/budget-statement',
                //     synchronizationUnits: [
                //         {
                //             syncId: randomUUID(),
                //             scope: "global",
                //             branch: 'main'
                //         }
                //     ]
                // })),
                // server.addDriveAction("load", actions.addFolder({id: randomUUID(), name: randomUUID()})),
            ]);

            console.timeEnd("test-" + index);
            index += 1
            const status = result[0].status;
            if (status !== "SUCCESS") {
                console.log(status, result[0].error);
            }

            await new Promise(resolve => setTimeout(resolve, 2000))
        }

        expect(index).toBe(1);
    })
})
import { DocumentDriveServer } from "../../server";
import { QueueManager } from "../manager";
import { IServerDelegate } from "../types";

const cluster = require('node:cluster');
const numCPUs = require('node:os').availableParallelism();
const process = require('node:process');

// TODO: Should be moved to drive index
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

} else {
    // Workers can share any TCP connection
    // In this case it is an HTTP server

    const delegate: IServerDelegate = {
        checkDocumentExists: async (driveId: string, documentId: string) => {
            return true;
        },
        processJob: async (job) => {
            return { success: true, message: 'Job processed' };
        }
    }

    const onError = (error: Error) => {
        console.error(error);
    }

    const qm = new QueueManager();
    qm.init(delegate, onError);


    console.log(`Worker ${process.pid} started`);
}
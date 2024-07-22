import { createClient, RedisClientType } from "redis";
import { DocumentDriveServer, IOperationResult } from "../../server";
import { MemoryQueue } from "../adapter/memory";
import { RedisQueue } from "../adapter/redis";
import { QueueManager } from "../manager";
import { IQueue, IServerDelegate, Job } from "../types";

const cluster = require('node:cluster');
const numCPUs = require('node:os').availableParallelism();
const process = require('node:process');

// TODO: Should be moved to drive index
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    // instantiate document drive server
    const server = new DocumentDriveServer([]);
    server.initialize();
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
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

    // Initialize queue manager for worker with redis
    createClient({
        
    })
        .connect()
        .then((client) => {
            const queue: IQueue<Job, IOperationResult> = new RedisQueue(client as RedisClientType);
            const qm = new QueueManager(queue);
            return qm
                .init(delegate, onError)
                .then(qm.processNextJob)
        });


    console.log(`Worker ${process.pid} started`);
}
import { DocumentDriveServer } from "../server";
import { Operation } from "document-model/document";
import BeeQueue from "bee-queue";

export interface Job {
    jobId: string;
    driveId: string;
    documentId: string;
    operations: Operation[];
    forceSync: boolean;
}

export class QueueManager {
    private server: DocumentDriveServer;
    private MAX_JOBS = 3;
    private queues = new Array<BeeQueue>
    private workers = Array.from({ length: this.MAX_JOBS }, (_, i) => "idle");

    constructor(server: DocumentDriveServer) {
        this.server = server;
    }

    addJob(driveId: string, documentId: string, operations: Operation[], forceSync: boolean) {
        const queue = this.getQueue(driveId, documentId);
        const { id } = queue.createJob({ operations, forceSync });
        return id;
    }

    processNextJob() {
        // find queue with jobs and free worker
        const queue = this.queues.shift();

        // no queues
        if (!queue) {
            setTimeout(() => this.processNextJob(), 1000);
            return;
        }
        let workerIndex = this.workers.indexOf("idle");

        // no free workers
        if (workerIndex === -1) {
            setTimeout(() => this.processNextJob(), 100);
            return;
        }

        let worker = this.workers[workerIndex];
        if (!worker) {
            // TODO: nothing todo || no free worker => wait a while and try again
            throw new Error("Worker not found")
        }

        if (queue.jobs.length > 0) {
            this.workers[workerIndex] = "working";
            queue.process((job) => {
                const [driveId, documentId] = queue.name.split("/")
                const { operations, forceSync } = job.data;
                return this.server.addOperations(driveId!, documentId!, operations, forceSync).finally(() => { this.workers[workerIndex] = "idle"; this.queues.push(queue); this.processNextJob() });
            });
        }

    }

    getQueue(driveId: string, documentId: string): BeeQueue {
        let id = `${driveId}/${documentId}`;
        let queue = this.queues.find(q => q.name === id);
        if (!queue) {
            queue = new BeeQueue(id, {});
            queue.on("ready", () => {
                this.processNextJob();
            });
            this.queues.push(queue);
        }

        return queue;
    }
}
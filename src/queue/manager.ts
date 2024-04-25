import { DocumentDriveServer } from "../server";
import { Queue } from "./queue";

export class QueueManager {

    private queues = new Map<string, Queue>
    private server: DocumentDriveServer;

    constructor(server: DocumentDriveServer) {
        this.server = server;
    }

    getQueue(driveId: string, documentId: string): Queue {
        let id = `${driveId}:${documentId}`;
        let queue = this.queues.get(id);
        if (!queue) {
            queue = new Queue(driveId, documentId, this.server);
            this.queues.set(id, queue);
        }

        return queue;
    }
}
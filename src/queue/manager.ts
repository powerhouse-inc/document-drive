import { Queue } from "./queue";

export class QueueManager {

    private processOperationsFn: Function;
    private processDriveOperationsFn: Function;
    private queues = new Map<string, Queue>

    constructor(processOperationsFn: Function, processDriveOperationsFn: Function) {
        console.log("QueueManager intiated");
        this.processOperationsFn = processOperationsFn;
        this.processDriveOperationsFn = processDriveOperationsFn;
    }

    getQueue(driveId: string, documentId: string): Queue {
        let id = `${driveId}:${documentId}`;
        let queue = this.queues.get(id);
        if (!queue) {
            queue = new Queue(driveId, documentId, this.processOperationsFn, this.processDriveOperationsFn);
            this.queues.set(id, queue);
        }

        console.log("Getting Queue ", id);
        return queue;
    }



}
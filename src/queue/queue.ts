import { Operation } from "document-model/document";
import { generateUUID } from "../utils";
import { delay } from "./utils";

export class Queue {

    private driveId: string;
    private documentId: string;
    private processOperationsFn: Function;
    private processDriveOperationsFn: Function;
    private queue = new Array<string>();
    private queueState = new Map<string, Operation[]>();
    private resultState = new Map<string, any>();
    private queueInterval: any;

    constructor(driveId: string, documentId: string, processOperationsFn: Function, processDriveOperationsFn: Function) {
        this.driveId = driveId;
        this.documentId = documentId;
        this.processOperationsFn = processOperationsFn;
        this.processDriveOperationsFn = processDriveOperationsFn;
    }

    start() {
        this.queueInterval = setInterval(this.process.bind(this), 100);
    }

    stop() {
        clearInterval(this.queueInterval);
    }

    addOperations(operations: Operation[]): string {
        const jobId = generateUUID();
        this.queueState.set(jobId, operations);
        this.queue.push(jobId);
        return jobId;
    }

    async wait(jobId: string) {
        while (!this.resultState.has(jobId)) {
            await delay(100);
        }

        const result = this.resultState.get(jobId);
        this.resultState.delete(jobId);
        this.queueState.delete(jobId);
        return result;
    }

    async process() {
        console.log("this is not getting called :-((((")
        const jobId = this.queue.shift();
        if (!jobId) {
            return;
        }

        const operations = this.queueState.get(jobId);

        if (this.driveId !== "drives") {
            const result = await this.processOperationsFn(this.driveId, this.documentId, operations);
            this.resultState.set(jobId, result);

        } else {
            const result = await this.processDriveOperationsFn(this.documentId, operations);
            this.resultState.set(jobId, result);
        }
    }
}
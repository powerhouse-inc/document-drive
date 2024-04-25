import { Operation } from "document-model/document";
import { generateUUID } from "../utils";
import { DocumentDriveAction } from "document-model-libs/document-drive";
import { DocumentDriveServer, IOperationResult } from "../server";

export class Queue {

    private driveId: string;
    private documentId: string;
    private server: DocumentDriveServer;
    private queue = new Array<string>();
    private queueState = new Map<string, { operations: Operation[], forceSync: boolean }>();
    private resultState = new Map<string, IOperationResult>();
    private processing: boolean = false;

    constructor(driveId: string, documentId: string, server: DocumentDriveServer) {
        this.driveId = driveId;
        this.documentId = documentId;
        this.server = server
    }

    async addOperations(operations: Operation[], forceSync: boolean): string {
        const jobId = generateUUID();
        this.queueState.set(jobId, { operations, forceSync });
        this.queue.push(jobId);

        if (!this.processing) {
            this.processing = true;
            await this.process();
        }
        return jobId;
    }

    getResults(jobId: string) {
        while (this.processing) {
            console.log("wait for result")
        }
        return this.resultState.get(jobId);
    }

    async process() {
        const jobId = this.queue.shift();
        if (!jobId) {
            this.processing = false;
            return;
        }

        const entry = this.queueState.get(jobId);
        if (!entry) {
            this.processing = false;
            return;
        }

        const { operations, forceSync } = entry;
        if (this.driveId !== "drives") {
            const result = await this.server.addOperations(this.driveId, this.documentId, operations, forceSync);
            this.resultState.set(jobId, result);
        } else {
            const result = await this.server.addDriveOperations(this.documentId, operations as Operation<DocumentDriveAction>[], forceSync);
            this.resultState.set(jobId, result);
        }

        if (this.queue.length > 0) {
            this.process();
        } else {
            this.processing = false;
        }
    }
}
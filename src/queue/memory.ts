import { PrismaClient } from "@prisma/client";
import { DocumentHeader, Operation } from "document-model/document";

export interface OperationsJob {
    jobId: number,
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
    updatedOperations: Operation[]
}

export class InMemoryQueue {

    jobQueue = new Array<OperationsJob>();
    processFn: (job: OperationsJob) => Promise<void>;

    constructor(prisma: PrismaClient, processFn: (job: OperationsJob) => Promise<void>) {
        this.processFn = processFn;
    }

    async addOperations(drive: string,
        id: string,
        operations: Operation[],
        header: DocumentHeader,
        updatedOperations: Operation[] = []) {

        const jobId = Math.floor(Math.random() * 1000);
        this.jobQueue.push({ jobId, drive, id, operations, header, updatedOperations });
        return jobId;
    }
    async isFinished(jobId: number) {
        return this.jobQueue.filter(job => job.jobId === jobId).length === 0;
    }

    async process(): Promise<void> {
        const job = this.jobQueue[0];
        if (!job) {
            setTimeout(() => this.process(), 1000);
            return;
        }
        await this.processFn(job);
        this.jobQueue.shift();
        return this.process();
    }
}
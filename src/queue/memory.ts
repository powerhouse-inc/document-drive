import { EventEmitter } from "stream";
import { IQueue, IQueueManager } from "./types";
import { generateUUID } from "../utils";
import { Operation } from "document-model/document";

export class MemoryQueue implements IQueue {

    private name: string;
    private blocked: boolean = false;
    private items: any[] = [];
    private results: any = {};

    constructor(name: string) {
        this.name = name;
    }
    async setResult(jobId: string, result: any): Promise<void> {
        this.results[jobId] = result;
    }
    async getResult(jobId: string): Promise<any> {
        const results = await this.results[jobId];
        if (!results) {
            return null;
        }
        return results;
    }

    async addJob(data: any) {
        this.items.push(data);
    }

    async getNextJob() {
        const job = await this.items.shift();
        if (!job) {
            return null;
        }
        return job;
    }

    async amountOfJobs() {
        return this.items.length;
    }

    getName() {
        return this.name;
    }

    setBlocked(blocked: boolean) {
        this.blocked = blocked;
    }

    isBlocked() {
        return this.blocked;
    }

}

export class MemoryQueueManager extends EventEmitter implements IQueueManager {


    private ticker: number = 0;
    private queues: IQueue[] = [];
    private workers: number = 3;
    private processFn: (driveId: string, documentId: string, operations: Operation[], forceSync: boolean) => Promise<void>;

    constructor(processFn: (driveId: string, documentId: string, operations: Operation[], forceSync: boolean) => Promise<any>, workers: number = 3) {
        super();
        this.workers = workers;
        this.processFn = processFn;
    }


    async getResults(driveId: string, documentId: string, jobId: string): Promise<any> {
        const queue = await this.getQueue(driveId, documentId);
        return queue.getResult(jobId);
    }

    async init() {
        // Start workers
        for (let i = 0; i < this.workers; i++) {
            this.processNextJob();
        }
    }

    async addJob(driveId: string, documentId: string, operations: Operation[], forceSync: boolean) {
        const jobId = generateUUID();
        const queue = await this.getQueue(driveId, documentId);
        await queue.addJob({ jobId, operations, forceSync });
        return jobId;
    }

    async getQueue(driveId: string, documentId: string): Promise<IQueue> {
        const queueId = `${driveId}:${documentId}`;
        let queue = this.queues.find((q) => q.getName() === queueId);

        if (!queue) {
            queue = new MemoryQueue(queueId);
            this.queues.push(queue);
        }

        return queue;
    }

    async processNextJob() {
        if (this.queues.length === 0) {
            setTimeout(() => this.processNextJob(), 5000);
            return;
        }

        const queue = this.queues[this.ticker];
        this.ticker = this.ticker === this.queues.length ? 0 : this.ticker + 1;
        if (!queue) {
            this.ticker = 0;
            setTimeout(() => this.processNextJob(), 1000);
            return;
        }

        if (await queue.amountOfJobs() === 0 || await queue.isBlocked()) {
            setTimeout(() => this.processNextJob(), 1000);
            return;
        }

        queue.setBlocked(true);
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            setTimeout(() => this.processNextJob(), 1000);
            return;
        }

        const [status, driveId, documentId] = queue.getName().split(":");
        const { jobId, operations, forceSync } = nextJob;
        try {
            const result = await this.processFn(driveId!, documentId!, operations, forceSync);
            this.emit("jobCompleted", { driveId, documentId, jobId, result });
        } catch (e) {
            console.error(e);
        }

        queue.setBlocked(false);
        this.processNextJob();

        return;

    }

    async getResult(driveId: string, documentId: string, jobId: string) {
        const queue = await this.getQueue(driveId, documentId);
        return queue.getResult(jobId);
    }
}
import { createClient, RedisClientType } from "redis";
import { IQueue, IQueueManager } from "./types";
import { generateUUID } from "../utils";
import { Operation } from "document-model/document";
import { EventEmitter } from "stream";

export class RedisQueue implements IQueue {

    private client: RedisClientType;
    private name: string;
    private blocked: boolean = false;

    constructor(name: string, client: RedisClientType) {
        this.client = client;
        this.name = name;
    }
    async setResult(jobId: string, result: any): Promise<void> {
        await this.client.hSet("results", jobId, JSON.stringify(result));
    }
    async getResult(jobId: string): Promise<any> {
        const results = await this.client.hGet("results", jobId);
        if (!results) {
            return null;
        }
        return JSON.parse(results);
    }

    async addJob(data: any) {
        await this.client.lPush(this.name, JSON.stringify(data));
    }

    async getNextJob() {
        const job = await this.client.rPop(this.name);
        if (!job) {
            return null;
        }
        return JSON.parse(job);
    }

    async amountOfJobs() {
        return this.client.lLen(this.name);
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

export class RedisQueueManager extends EventEmitter implements IQueueManager {

    private client: RedisClientType | null = null;
    private ticker: number = 0;
    private workers: number = 3;
    private queues: IQueue[] = [];
    private processFn: (driveId: string, documentId: string, operations: Operation[], forceSync: boolean) => Promise<void>;

    constructor(processFn: (driveId: string, documentId: string, operations: Operation[], forceSync: boolean) => Promise<any>, client: RedisClientType | null = null, workers: number = 3) {
        super();
        this.workers = workers;
        this.processFn = processFn;
    }
    async getResults(driveId: string, documentId: string, jobId: string): Promise<any> {
        if (!this.client) {
            await this.init();
        }
        const queue = await this.getQueue(driveId, documentId);
        const results = await queue.getResult(jobId);
        if (!results) {
            return null;
        }
        return results;
    }

    async init() {
        if (!this.client) {
            this.client = await createClient({
                url: process.env.REDIS_TLS_URL, socket: {
                    tls: true,
                    rejectUnauthorized: false
                }
            });

            await this.client?.connect();
        }

        const queues = await this.client.lRange("queues", 0, -1);
        this.queues = queues.map((queue) => new RedisQueue(queue, this.client!));

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
        const queueId = `${status}:${driveId}:${documentId}`;
        let queue = this.queues.find((q) => q.getName() === queueId);
        if (!this.client) {
            await this.init();
        }
        if (!queue) {
            queue = new RedisQueue(queueId, this.client!);
            this.queues.push(queue);
            this.client!.rPush("queues", queueId);
        }

        return queue;
    }

    async processNextJob() {
        const that = this;
        if (this.queues.length === 0) {
            setTimeout(() => that.processNextJob(), 1000);
            return;
        }

        const queue = this.queues[this.ticker];
        this.ticker = this.ticker === this.queues.length ? 0 : this.ticker + 1;
        if (!queue) {
            this.ticker = 0;
            setTimeout(() => that.processNextJob(), 1000);
            return;
        }

        if (await queue.amountOfJobs() === 0 || await queue.isBlocked()) {
            setTimeout(() => that.processNextJob(), 1000);
            return;
        }

        queue.setBlocked(true);
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            setTimeout(() => that.processNextJob(), 1000);
            return;
        }

        const [status, driveId, documentId] = queue.getName().split(":");
        const { jobId, operations, forceSync } = nextJob;
        try {
            if (!this.client) {
                await this.init();
            }
            const result = await this.processFn(driveId!, documentId!, operations, forceSync);
            await this.client!.hSet("results", jobId, JSON.stringify(result));
            this.emit("jobCompleted", { driveId, documentId, jobId, result });
        } catch (e) {
            console.error(e);
        }

        queue.setBlocked(false);
        this.processNextJob();

        return;

    }

    getResult(driveId: string, documentId: string, jobId: string) {
        return new Promise(async (resolve, reject) => {
            if (!this.client) {
                await this.init();
            }
            const results = await this.client!.HGET("results", jobId);
            if (!results) {
                this.on("jobCompleted", (data) => {
                    if (data.driveId === driveId && data.documentId === documentId && data.jobId === jobId) {
                        resolve(data.result);
                    }
                });

                setTimeout(() => {
                    reject("Job result not found");
                }, 5000);
            }
        });
    }
}
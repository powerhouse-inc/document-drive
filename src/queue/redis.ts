import { RedisClientType } from "redis";
import { IJob, IJobQueue, IQueue, IQueueManager, JobId, OperationJob, OperationJobProcessor, QueueEvents } from "./types";
import { Unsubscribe, createNanoEvents } from "nanoevents";
import { MemoryQueueManager } from "./memory";
import { IOperationResult } from "../server";

export class RedisQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private client: RedisClientType;

    constructor(id: string, client: RedisClientType) {
        this.client = client;
        this.id = id;

    }

    async init() {
        const queueExists = await this.client.hGet("queues", this.id);
        if (!queueExists) {
            await this.client.hSet("queues", this.id, JSON.stringify({ blocked: false, items: [], dependencies: [] }));
        }
    }

    async setResult(jobId: string, result: any): Promise<void> {
        await this.client.hSet(this.id + "-results", jobId, JSON.stringify(result));
    }
    async getResult(jobId: string): Promise<any> {
        const results = await this.client.hGet(this.id + "-results", jobId);
        if (!results) {
            return null;
        }
        return JSON.parse(results);
    }

    async addJob(data: any) {
        await this.client.lPush(this.id + "-jobs", JSON.stringify(data));
    }

    async getNextJob() {
        const job = await this.client.rPop(this.id + "-jobs");
        if (!job) {
            return null;
        }
        return JSON.parse(job);
    }

    async amountOfJobs() {
        return this.client.lLen(this.id + "-jobs");
    }

    async setBlocked(blocked: boolean) {
        if (blocked) {
            await this.client.hSet(this.id, "blocked", JSON.stringify(true));
        } else {
            await this.client.hDel(this.id, "blocked");
        }
    }

    async isBlocked() {
        const blockedResult = await this.client.hGet(this.id, "blocked");
        if (blockedResult) {
            return true;
        }

        return false;
    }

    getId() {
        return this.id;
    }

    async getJobs() {
        const entries = await this.client.lRange(this.id + "-jobs", 0, -1)
        return entries.map(e => JSON.parse(e));
    }

    async addDependencies(job: IJob<OperationJob>) {
        await this.client.lPush(this.id + "-deps", JSON.stringify(job));
        await this.setBlocked(true);
    }

    async removeDependencies(job: IJob<OperationJob>) {
        await this.client.lRem(this.id + "-deps", 1, JSON.stringify(job));
        const allDeps = await this.client.lLen(this.id + "-deps");
        if (allDeps > 0) {
            await this.setBlocked(true);
        } else {
            await this.setBlocked(false);
        }
    }
}

export class RedisQueueManager extends MemoryQueueManager implements IQueueManager {

    private client: RedisClientType;

    constructor(workers = 3, timeout = 0, client: RedisClientType) {
        super(workers, timeout);
        this.client = client;
    }

    async getQueue(driveId: string, documentId?: string): Promise<IJobQueue> {
        const queueId = documentId ? `${driveId}:${documentId}` : `drives:${driveId}`;
        const queue = new RedisQueue(queueId, this.client);
        await queue.init();
        return queue;
    }

    async getQueues() {
        return this.client.hKeys("queue");
    }

}
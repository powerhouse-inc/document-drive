import { RedisClientType } from "redis";
import { IJob, IQueue, IQueueManager, IServerDelegate, OperationJob } from "./types";
import { BaseQueueManager } from "./base";

export class RedisQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private client: RedisClientType;

    constructor(id: string, client: RedisClientType) {
        this.client = client;
        this.id = id;
        this.client.hSet("queues", id, "true");
        this.client.hSet(this.id, "blocked", "false");
    }

    async addJob(data: any) {
        await this.client.lPush(this.id + "-jobs", JSON.stringify(data));
    }

    async getNextJob() {
        const job = await this.client.rPop(this.id + "-jobs");
        if (!job) {
            return undefined;
        }
        return JSON.parse(job) as IJob<T>;
    }

    async amountOfJobs() {
        return this.client.lLen(this.id + "-jobs");
    }

    getId() {
        return this.id;
    }

    async getJobs() {
        const entries = await this.client.lRange(this.id + "-jobs", 0, -1)
        return entries.map(e => JSON.parse(e) as IJob<T>);
    }

    async createOrUpdateJobs(jobs: IJob<T>[]) {
        await this.client.del(this.id + "-jobs");
        for (const job of jobs) {
            await this.client.lPush(this.id + "-jobs", JSON.stringify(job));
        }
    }

    async removeJobs(jobIds: string[]) {
        for (const jobId of jobIds) {
            await this.client.lRem(this.id + "-jobs", 1, JSON.stringify(jobId));
        }
    }
}

export class RedisQueueManager extends BaseQueueManager implements IQueueManager {

    private client: RedisClientType;

    constructor(workers = 3, timeout = 0, client: RedisClientType) {
        super(workers, timeout);
        this.client = client;
        this.setQueue(new RedisQueue<OperationJob, any>("queue", this.client));
    }
}
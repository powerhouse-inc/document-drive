import { RedisClientType } from "redis";
import { IJob, IQueue, IQueueManager, IServerDelegate, OperationJob } from "./types";
import { BaseQueueManager } from "./base";

export class RedisQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private client: RedisClientType;

    constructor(id: string, client: RedisClientType) {
        this.client = client;
        this.id = id;
    }

    async addJob(job: IJob<T>) {
        this.client.zAdd(this.id + "-jobs", {
            score: job.score,
            value: JSON.stringify(job)
        });
    }

    async getNextJob() {
        let entry: null | any = null;
        while (!entry) {
            entry = await this.client.zPopMin(this.id + "-jobs");
            if (!entry) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return { ...JSON.parse(entry.value), score: entry.score } as IJob<T>;
    }

    async amountOfJobs() {
        return this.client.zCount(this.id + "-jobs", 0, -1);
    }

    getId() {
        return this.id;
    }

    async getJobs() {
        const entries = await this.client.zRangeWithScores(this.id + "-jobs", 0, -1)
        return entries.map(e => ({ ...JSON.parse(e.value), score: e.score }) as IJob<T>);
    }

    async createOrUpdateJobs(jobs: IJob<T>[]) {
        for (const job of jobs) {
            await this.addJob(job);
        };
    }

    async removeJobs(jobIds: string[]) {
        const entries = await this.getJobs();
        const entriesToDelete = entries.filter(e => jobIds.includes(e.jobId))
        for (const entry of entriesToDelete) {
            await this.client.zRem(this.id + "-jobs", JSON.stringify(entry));
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
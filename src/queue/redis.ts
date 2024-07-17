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
            value: Date.now() + "_" + JSON.stringify({ ...job })
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
        const data = entry.value.match(/(?<=_)(.*)/);
        if (!data[0]) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return { ...JSON.parse(data[0]), score: entry.score } as IJob<T>;
    }

    async amountOfJobs() {
        return (await this.getJobs()).length
    }

    getId() {
        return this.id;
    }

    async getJobs() {
        const entries = await this.client.zRangeWithScores(this.id + "-jobs", 0, -1)
        return entries.map(e => {
            // regex to remove everything before first _
            const data = e.value.match(/(?<=_)(.*)/);
            if (!data || data.length === 0) {
                throw new Error("Couldn't match job task")
            }

            return { ...JSON.parse(data![0]!), score: e.score } as IJob<T>;

        });
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
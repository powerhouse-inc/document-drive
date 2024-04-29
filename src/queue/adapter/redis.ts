import { RedisClientType } from "redis";
import { IQueue } from "../types";

export class RedisQueueAdapter implements IQueue {

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
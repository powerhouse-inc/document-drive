import { IQueue } from "../types";

export class MemoryQueueAdapter implements IQueue {

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
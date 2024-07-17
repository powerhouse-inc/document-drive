import { IJob, IQueue } from "./types";

export class MemoryQueue<T, R> implements IQueue<T, R> {
    private items: IJob<T>[] = [];

    async addJob(data: IJob<T>) {
        this.items.push(data);
        return Promise.resolve();
    }

    async getNextJob() {
        const job = this.items.shift();
        return Promise.resolve(job);
    }

    async amountOfJobs() {
        return Promise.resolve(this.items.length);
    }

    getId() {
        return 'document-drive-job-queue';
    }

    async getJobs() {
        return this.items.sort((a, b) => a.jobId > b.jobId ? 1 : -1).sort((a, b) => a.score - b.score);
    }

    async createOrUpdateJobs(jobs: IJob<T>[]) {
        const jobIds = jobs.map(j => j.jobId);
        this.items = this.items.filter(e => !jobIds.includes(e.jobId)).concat(jobs);
    }

    async removeJobs(jobIds: string[]) {
        this.items = this.items.filter(e => !jobIds.includes(e.jobId));
    }

    async increaseJobScore(jobId: string, score: number) {
        const job = this.items.find(j => j.jobId === jobId);
        if (job) {
            job.score += score;
        }
    }

    async decreaseJobScore(jobId: string, score: number) {
        const job = this.items.find(j => j.jobId === jobId);
        if (job) {
            job.score -= score;
        }
    }
}
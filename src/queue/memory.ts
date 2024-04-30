import { EventEmitter } from "stream";
import { IJob, IJobQueue, IQueue, IQueueManager, JobId, OperationJob, OperationJobProcessor, QueueEvents } from "./types";
import { generateUUID } from "../utils";
import { IOperationResult } from "../server";
import { createNanoEvents, Unsubscribe } from 'nanoevents';

export class MemoryQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private blocked = false;
    private items: IJob<T>[] = [];
    private results = new Map<JobId, R>();

    constructor(id: string) {
        this.id = id;
    }
    async setResult(jobId: string, result: R): Promise<void> {
        this.results.set(jobId, result);
        return Promise.resolve();
    }

    async getResult(jobId: string): Promise<R | undefined> {
        return Promise.resolve(this.results.get(jobId));
    }

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
        return this.id;
    }

    setBlocked(blocked: boolean) {
        this.blocked = blocked;
    }

    isBlocked() {
        return this.blocked;
    }

}

export class MemoryQueueManager implements IQueueManager {

    private emitter = createNanoEvents<QueueEvents>();
    private ticker = 0;
    private queues: IJobQueue[] = [];
    private workers = 3;
    private processFn: OperationJobProcessor | undefined;

    constructor(workers = 3) {
        this.workers = workers;
    }

    async init(processor: OperationJobProcessor, onError: (err: Error) => void) {
        this.processFn = processor;
        // Start workers
        for (let i = 0; i < this.workers; i++) {
            this.processNextJob().catch(onError);
        }
        return Promise.resolve()
    }

    async addJob(job: OperationJob): Promise<JobId> {
        const jobId = generateUUID();
        const queue = this.getQueue(job.driveId, job.documentId);
        await queue.addJob({ jobId, ...job });
        return jobId;
    }

    async getResult(driveId: string, documentId: string, jobId: JobId): Promise<IOperationResult | undefined> {
        const queue = this.getQueue(driveId, documentId);
        return queue.getResult(jobId);
    }

    private getQueue(driveId: string, documentId?: string): IJobQueue {
        const queueId = `${driveId}${documentId ? `:${documentId}` : ''}`;
        let queue = this.queues.find((q) => q.getId() === queueId);

        if (!queue) {
            queue = new MemoryQueue(queueId);
            this.queues.push(queue);
        }

        return queue;
    }

    async processNextJob() {
        if (!this.processFn) {
            throw new Error("No job processor defined");
        }

        if (this.queues.length === 0) {
            setTimeout(() => this.processNextJob.bind(this)(), 1000);
            return;
        }

        const queue = this.queues[this.ticker];
        this.ticker = this.ticker === this.queues.length ? 0 : this.ticker + 1;
        if (!queue) {
            this.ticker = 0;
            setTimeout(() => this.processNextJob.bind(this)(), 1000);
            return;
        }

        if (queue.isBlocked() || await queue.amountOfJobs() === 0) {
            setTimeout(() => this.processNextJob.bind(this)(), 1000);
            return;
        }

        queue.setBlocked(true);
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            setTimeout(() => this.processNextJob.bind(this)(), 1000);
            return;
        }

        try {
            const result = await this.processFn(nextJob);
            this.emit("jobCompleted", nextJob, result);
        } catch (e) {
            this.emit("jobFailed", nextJob, e as Error);
        } finally {
            queue.setBlocked(false);
            void this.processNextJob.bind(this)();
        }
    }

    protected emit<K extends keyof QueueEvents>(
        event: K,
        ...args: Parameters<QueueEvents[K]>
    ) {
        this.emitter.emit(event, ...args);
    }
    on<K extends keyof QueueEvents>(this: this, event: K, cb: QueueEvents[K]): Unsubscribe {
        return this.emitter.on(event, cb);
    }
}
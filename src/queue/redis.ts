import { RedisClientType } from "redis";
import { IJob, IQueue, IQueueManager, JobId, OperationJob, OperationJobProcessor, QueueEvents } from "./types";
import { generateUUID } from "../utils";
import { Unsubscribe, createNanoEvents } from "nanoevents";
import { AddFileInput } from "document-model-libs/document-drive";
import { IOperationResult } from "../server";
import { Operation } from "document-model/document";

export class RedisQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private client: RedisClientType;
    private blocked = false;


    private dependencies = new Array<IJob<OperationJob>>();

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
        const entries = await this.client.lPush(this.id + "-deps", JSON.stringify(job));
        if (!(await this.isBlocked())) {
            await this.setBlocked(true);
        }
    }

    async removeDependencies(job: IJob<OperationJob>) {
        const entries = await this.client.lPush(this.id + "-deps", JSON.stringify(job));
        if (!(await this.isBlocked())) {
            await this.setBlocked(true);
        }

        this.dependencies = this.dependencies.filter((j) => j.jobId !== job.jobId && j.driveId !== job.driveId);
        if (this.dependencies.length === 0) {
            this.setBlocked(false);
        }
    }
}

export class RedisQueueManager implements IQueueManager {

    private client: RedisClientType;
    private emitter = createNanoEvents<QueueEvents>();
    private ticker = 0;
    private workers: number;
    private timeout: number;
    private processFn: OperationJobProcessor | undefined;


    constructor(workers = 3, timeout = 0, client: RedisClientType) {
        this.client = client;
        this.workers = workers;
        this.timeout = timeout;
    }

    async init(processor: OperationJobProcessor, onError: (err: Error) => void) {
        this.processFn = processor;
        // Start workers
        for (let i = 0; i < this.workers; i++) {
            this.processNextJob().catch(onError);
        }
        return Promise.resolve()
    }

    async getResults(driveId: string, documentId: string, jobId: string): Promise<any> {
        const queue = await this.getQueue(driveId, documentId);
        const results = await queue.getResult(jobId);
        if (!results) {
            return null;
        }
        return results;
    }


    async addJob(job: OperationJob): Promise<JobId> {
        const jobId = generateUUID();
        const queue = await this.getQueue(job.driveId, job.documentId);
        await queue.addJob({ jobId, ...job });

        // block the document queue if this is a document job with op index 0 and a depending job with add file in the drive queue
        const firstOp = job.documentId && job.operations[0]?.index === 0;
        if (firstOp) {
            const driveQueue = await this.getQueue(job.driveId);
            const jobs = await driveQueue.getJobs();
            for (let driveJob of jobs) {
                const op = driveJob.operations.find((j: Operation) => {
                    const input = j.input as AddFileInput;
                    return j.type === "ADD_FILE" && input.id === job.documentId
                })
                if (op) {
                    queue.addDependencies(driveJob);
                }
            }
        }

        // block the document queue if the job contains an add file operation for a drive
        const addFileOps = job.operations.filter((j: Operation) => j.type === "ADD_FILE");
        for (const addFileOp of addFileOps) {
            const input = addFileOp.input as AddFileInput;
            const q = await this.getQueue(job.driveId, input.id)
            q.addDependencies({ jobId, ...job });
        }

        return jobId;
    }

    async getQueue(driveId: string, documentId?: string) {
        const queueId = documentId ? `${driveId}:${documentId}` : `drives:${driveId}`;
        const queue = new RedisQueue(queueId, this.client);
        await queue.init();
        return queue;
    }

    private async _getQueues() {
        return this.client.hKeys("queue");
    }


    private async processNextJob() {
        if (!this.processFn) {
            throw new Error("No job processor defined");
        }

        const queues = await this._getQueues();

        if (queues.length === 0) {
            this.retryNextJob();
            return;
        }

        const queueId = queues[this.ticker];

        this.ticker = this.ticker === queues.length ? 0 : this.ticker + 1;
        if (!queueId) {
            this.ticker = 0;
            this.retryNextJob();
            return;
        }

        const [driveId, documentId] = queueId.split(":");
        const queue = await this.getQueue(driveId!, documentId!);
        if (await queue.isBlocked()) {
            this.retryNextJob();
            return;
        }

        if (await queue.amountOfJobs() === 0) {
            this.retryNextJob();
            return;
        }

        queue.setBlocked(true);
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            this.retryNextJob();
            return;
        }

        try {
            const result = await this.processFn(nextJob);

            // unblock the document queues of each add_file operation
            const addFileOperations = nextJob.operations.filter((op: { type: string; }) => op.type === "ADD_FILE");
            if (addFileOperations.length > 0) {
                addFileOperations.map(() => {
                    queue.removeDependencies(nextJob);
                });
            }

            this.emit("jobCompleted", nextJob, result);
        } catch (e) {
            this.emit("jobFailed", nextJob, e as Error);
        } finally {
            queue.setBlocked(false);
            void this.processNextJob();
        }
    }

    async getResult(driveId: string, documentId: string, jobId: JobId): Promise<IOperationResult | undefined> {
        const queue = await this.getQueue(driveId, documentId);
        return queue.getResult(jobId);
    }



    private retryNextJob() {
        const retry = this.timeout === 0 && typeof setImmediate !== "undefined" ? setImmediate : (fn: () => void) => setTimeout(fn, this.timeout);
        return retry(() => this.processNextJob());
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
import {
    AddFileInput,
    DeleteNodeInput
} from 'document-model-libs/document-drive';
import { Action } from 'document-model/document';
import { Unsubscribe, createNanoEvents } from 'nanoevents';
import { generateUUID } from '../utils';
import {
    IJob,
    IJobQueue,
    IQueue,
    IQueueManager,
    IServerDelegate,
    Job,
    JobId,
    QueueEvents,
    isOperationJob
} from './types';
import { IOperationResult } from '../server';

export class MemoryQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private items: IJob<T>[] = [];

    constructor(id: string) {
        this.id = id;
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

export class BaseQueueManager implements IQueueManager {
    protected emitter = createNanoEvents<QueueEvents>();
    protected ticker = 0;
    protected queue: IQueue<Job, IOperationResult>;
    protected workers: number;
    protected timeout: number;
    private delegate: IServerDelegate | undefined;

    constructor(workers = 3, timeout = 0) {
        this.workers = workers;
        this.timeout = timeout;
        this.queue = new MemoryQueue<Job, IOperationResult>('queue')
    }

    setQueue(queue: IQueue<Job, IOperationResult>) {
        this.queue = queue;
    }

    async init(
        delegate: IServerDelegate,
        onError: (error: Error) => void
    ): Promise<void> {
        this.delegate = delegate;
        for (let i = 0; i < this.workers; i++) {
            setTimeout(
                () => this.processNextJob.bind(this)().catch(onError),
                100 * i
            );
        }
        return Promise.resolve();
    }

    async addJob(job: Job): Promise<JobId> {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const jobId = Date.now() + "_" + generateUUID();
        const queue = this.queue;

        // calculate score
        let score = 0;
        const dependencies: string[] = [];

        const newDocument =
            job.documentId &&
            !(await this.delegate.checkDocumentExists(
                job.driveId,
                job.documentId
            ));

        // if job is a new document check for the add file operation in the queue and increase score of job if add file is found
        const jobs = await this.queue.getJobs();
        if (newDocument) {
            const addFileDriveJobs = jobs.filter(j => {
                const actions = isOperationJob(j)
                    ? j.operations
                    : j.actions;

                const op = actions.find((j: Action) => {
                    const input = j.input as AddFileInput;
                    return j.type === 'ADD_FILE' && input.id === job.documentId;
                });

                if (op) {
                    return true;
                }

                return false;
            })

            score += addFileDriveJobs.length;
            addFileDriveJobs.forEach(j => {
                dependencies.push(j.jobId);
            });
        }

        // if new job has add file operation then increase score of existing operations
        const actions = isOperationJob(job) ? job.operations : job.actions;
        const filteredActions = actions.filter((j: Action) => j.type === 'ADD_FILE');

        for (const addFileOp of filteredActions) {
            const input = addFileOp.input as AddFileInput;

            const filteredJobs = jobs.filter(j => {
                input.id === j.documentId;
            }).map(j => {
                if (j.dependencies && j.dependencies.includes(jobId)) {
                    return j;
                } else {
                    return {
                        ...j,
                        score: j.score + 1,
                        dependencies: [...j.dependencies ?? [], jobId]
                    };
                }
            });

            await queue.createOrUpdateJobs(filteredJobs);
        }

        // if new job has delete_node operation then remove existing operations from queue
        const removeFileOps = actions.filter(
            (j: Action) => j.type === 'DELETE_NODE'
        );
        for (const removeFileOp of removeFileOps) {
            const input = removeFileOp.input as DeleteNodeInput;

            const filteredJobs = jobs.filter(j => {
                input.id === j.documentId;
            });

            await queue.removeJobs(filteredJobs.map(j => j.jobId));
        }

        // add job to queue
        await queue.addJob({ jobId, score, dependencies, ...job });
        return jobId;
    }


    private retryNextJob(timeout?: number) {
        const _timeout = timeout !== undefined ? timeout : this.timeout;
        const retry =
            _timeout === 0 && typeof setImmediate !== 'undefined'
                ? setImmediate
                : (fn: () => void) => setTimeout(fn, _timeout);
        return retry(() => this.processNextJob());
    }


    private async processNextJob() {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const queue = this.queue;
        // if no jobs in the current queue then looks for the
        // next queue with jobs. If no jobs in any queue then
        // retries after a timeout
        const amountOfJobs = await queue.amountOfJobs();
        if (amountOfJobs === 0) {
            this.retryNextJob();
            return;
        }

        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            this.retryNextJob();
            return;
        }

        try {
            const result = await this.delegate.processJob(nextJob);

            // unblock the document queues of each add_file operation
            const actions = isOperationJob(nextJob)
                ? nextJob.operations
                : nextJob.actions;
            const addFileActions = actions.filter(op => op.type === 'ADD_FILE');
            if (addFileActions.length > 0) {
                for (const addFile of addFileActions) {
                    const jobs = await queue.getJobs();
                    const filteredJobs = jobs.filter(j => {
                        j.dependencies.includes(nextJob.jobId);
                    }).map(j => {
                        // remove dependency from job
                        return {
                            ...j,
                            score: j.score - 1,
                            dependencies: j.dependencies?.filter(d => d !== nextJob.jobId)
                        };
                    });
                    await queue.createOrUpdateJobs(filteredJobs)
                }
            }
            this.emit('jobCompleted', nextJob, result);
        } catch (e) {
            console.error(`job failed`, e);
            this.emit('jobFailed', nextJob, e as Error);
        } finally {
            this.processNextJob();
        }
    }

    protected emit<K extends keyof QueueEvents>(
        event: K,
        ...args: Parameters<QueueEvents[K]>
    ) {
        this.emitter.emit(event, ...args);
    }
    on<K extends keyof QueueEvents>(
        this: this,
        event: K,
        cb: QueueEvents[K]
    ): Unsubscribe {
        return this.emitter.on(event, cb);
    }

    protected getQueueId(driveId: string, documentId?: string) {
        return `queue:${driveId}${documentId ? `:${documentId}` : ''}`;
    }
}

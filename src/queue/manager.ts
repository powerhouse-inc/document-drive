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
import { MemoryQueue } from './adapter/memory';
import { calculateJobScore } from './utils';

export class QueueManager implements IQueueManager {
    protected emitter = createNanoEvents<QueueEvents>();
    protected ticker = 0;
    protected queue: IQueue<Job, IOperationResult>;
    protected workers: number;
    protected activeWorkers: number;
    protected timeout: number;
    private delegate: IServerDelegate | undefined;
    private jobAddedListener: Unsubscribe | undefined;

    constructor(queue: IQueue<Job, IOperationResult> = new MemoryQueue<Job, IOperationResult>(), workers = 3, timeout = 0) {
        this.workers = workers;
        this.timeout = timeout;
        this.queue = queue;
        this.activeWorkers = 0;

    }

    async #onJobAdded(job: IJob<Job>) {
        if (this.workers > this.activeWorkers && job.score === 0) {
            this.processNextJob();
        }
    }

    async init(
        delegate: IServerDelegate,
        onError: (error: Error) => void
    ): Promise<void> {
        this.delegate = delegate;
        this.jobAddedListener = this.emitter.on('jobAdded', (job) => this.#onJobAdded(job));
        return Promise.resolve();
    }

    async addJob(job: Job): Promise<JobId> {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const iJob = await calculateJobScore({
            ...job,
            jobId: generateUUID(),
            score: 0,
            dependencies: []
        }, this.queue);
        await this.queue.addJob(iJob);
        this.emit('jobAdded', iJob);
        return iJob.jobId;
    }


    private async processNextJob() {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const queue = this.queue;
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            return;
        }

        try {
            this.activeWorkers += 1;
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
            this.activeWorkers -= 1;
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

}

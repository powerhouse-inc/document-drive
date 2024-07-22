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
    protected queue: IQueue<Job, IOperationResult>;
    protected timeout: number;
    private delegate: IServerDelegate | undefined;

    constructor(queue: IQueue<Job, IOperationResult> = new MemoryQueue<Job, IOperationResult>(), workers = 3, timeout = 0) {
        this.timeout = timeout;
        this.queue = queue;
    }

    async init(
        delegate: IServerDelegate,
        onError: (error: Error) => void
    ): Promise<void> {
        this.delegate = delegate;
        return Promise.resolve();
    }

    async addJob(job: Job): Promise<JobId> {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }
        // part 1: calculate job score and dependencies
        const iJob = await calculateJobScore({
            ...job,
            jobId: generateUUID(),
            score: 0,
            dependencies: []
        }, this.queue);
        // TODO: part 2: updateDependentJobs helper in Queue (increase score)
        await this.queue.addJob(iJob);
        this.emit('jobAdded', iJob);
        return iJob.jobId;
    }


    async processNextJob() {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const queue = this.queue;
        const nextJob = await queue.getNextJob();
        if (!nextJob) {
            await new Promise(resolve => setTimeout(resolve, this.timeout));
            this.processNextJob();
            return;
        }

        try {
            const result = await this.delegate.processJob(nextJob);

            // unblock the document queues of each add_file operation
            // TODO: Reduce score of dependent jobs
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

}

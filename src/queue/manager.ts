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
import { MemoryQueue } from './memory';

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
        // for (let i = 0; i < this.workers; i++) {
        //     setTimeout(
        //         () => this.processNextJob.bind(this)().catch(onError),
        //         100 * i
        //     );
        // }
        this.jobAddedListener = this.emitter.on('jobAdded', (job) => this.#onJobAdded(job));
        return Promise.resolve();
    }

    async addJob(job: Job): Promise<JobId> {
        if (!this.delegate) {
            throw new Error('No server delegate defined');
        }

        const jobId = generateUUID();
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

            score += 1;
            addFileDriveJobs.forEach(j => {
                dependencies.push(j.jobId);
                // score += 1;
            });
        }

        // if new job has add file operation then increase score of existing operations if existing arent already dependent on new job
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
            if (filteredJobs.length > 0) {
                await queue.createOrUpdateJobs(filteredJobs);
            }
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
        this.emit('jobAdded', { jobId, score, dependencies, ...job });
        return jobId;
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

        console.log("next: ", nextJob)

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

import { Action } from "document-model/document";
import { IOperationResult } from "../server";
import { IJob, IQueue, isOperationJob, Job } from "./types";
import { AddFileInput } from "document-model-libs/document-drive";

export const calculateJobScore = async (job: IJob<Job>, queue: IQueue<Job, IOperationResult>): Promise<IJob<Job>> => {
    const jobs = await queue.getJobs();
    const dependencies = (await Promise.all([
        checkAddFileDependency(job, jobs)
    ])).filter(e => Array.isArray(e) && e.length > 0)



    const uniqueDependencies = [...new Set(dependencies.flat().concat(job.dependencies))];
    job.dependencies = uniqueDependencies;
    job.score = uniqueDependencies.length;
    return job;
}

const checkAddFileDependency = async (job: IJob<Job>, queueJobs: IJob<Job>[]): Promise<string[]> => {

    // const newDocument =
    // job.documentId &&
    // !(await this.delegate.checkDocumentExists(
    //     job.driveId,
    //     job.documentId
    // ));
    if (!job.documentId) return [];

    const addFileDriveJobs = queueJobs.filter(j => {
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

    if (addFileDriveJobs.length === 0) {
        return [];
    }

    return addFileDriveJobs.map(j => j.jobId);
}




// // if new job has add file operation then increase score of existing operations if existing arent already dependent on new job
// const actions = isOperationJob(job) ? job.operations : job.actions;
// const filteredActions = actions.filter((j: Action) => j.type === 'ADD_FILE');
// for (const addFileOp of filteredActions) {
//     const input = addFileOp.input as AddFileInput;
//     const filteredJobs = jobs.filter(j => {
//         input.id === j.documentId;
//     }).map(j => {
//         if (j.dependencies && j.dependencies.includes(jobId)) {
//             return j;
//         } else {
//             return {
//                 ...j,
//                 score: j.score + 1,
//                 dependencies: [...j.dependencies ?? [], jobId]
//             };
//         }
//     });
//     if (filteredJobs.length > 0) {
//         await queue.createOrUpdateJobs(filteredJobs);
//     }
// }

// // if new job has delete_node operation then remove existing operations from queue
// const removeFileOps = actions.filter(
//     (j: Action) => j.type === 'DELETE_NODE'
// );
// for (const removeFileOp of removeFileOps) {
//     const input = removeFileOp.input as DeleteNodeInput;

//     const filteredJobs = jobs.filter(j => {
//         input.id === j.documentId;
//     });

//     await queue.removeJobs(filteredJobs.map(j => j.jobId));
// }

// // add job to queue

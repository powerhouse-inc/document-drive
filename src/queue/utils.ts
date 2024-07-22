import { IOperationResult } from "../server";
import { IJob, IQueue, Job } from "./types";

export const calculateJobScore = async (job: IJob<Job>, queue: IQueue<Job, IOperationResult>): Promise<number> => {
    const score = (await Promise.all([
        checkAddFileDependency(job, queue)
    ])).filter(e => e).length;

    return score;
}

const checkAddFileDependency = async (job: IJob<Job>, queue: IQueue<Job, IOperationResult>): Promise<boolean> => {
    //TODO: implement
    return false;
}
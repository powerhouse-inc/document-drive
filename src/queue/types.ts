import { Operation } from "document-model/document";

export interface IQueueManager {
    addJob(driveId: string, documentId: string, operations: Operation[], forceSync: boolean): Promise<string>;
    getResults(driveId: string, documentId: string, jobId: string): Promise<any>;
}

export interface IQueue {
    addJob(data: any): Promise<void>;
    getNextJob(): Promise<any>;
    amountOfJobs(): Promise<number>;
    getName(): string;
    setBlocked(blocked: boolean): void;
    isBlocked(): boolean;
    setResult(jobId: string, result: string): Promise<void>;
    getResult(jobId: string): Promise<any>;
}
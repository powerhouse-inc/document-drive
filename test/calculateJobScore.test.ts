import { describe, expect, it } from "vitest";
import { MemoryQueue } from "../src/queue/memory";
import { IJob, IQueue, Job } from "../src/queue/types";
import { actions, reducer, utils } from "document-model-libs/document-drive"
import { Operation } from "document-model/document";
import { calculateJobScore } from "../src/queue/utils";
import { IOperationResult } from "../src";
describe("calculateJobScore", () => {

    // generate job helper
    const generateJob = (score: number, operations: Operation[] = []): IJob<Job> => {
        return {
            jobId: Date.now().toString(),
            score,
            dependencies: [],
            driveId: "1",
            operations,
        }
    }


    it("should return 0 if no dependencies", async () => {
        const queue: IQueue<Job, IOperationResult> = new MemoryQueue();
        let driveDocument = utils.createDocument();

        // add file to document
        driveDocument = reducer(
            driveDocument,
            actions.addFile({
                name: "file1",
                documentType: "file",
                id: "1",
                synchronizationUnits: []
            })
        );

        // generate job from last operation
        const job = generateJob(0, driveDocument.operations.global.slice(-1) as Operation[]);
        const result = await calculateJobScore(job, queue);
        expect(result).toBe(0);
    })
});
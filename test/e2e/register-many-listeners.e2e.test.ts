import { beforeAll, describe, expect, it } from "vitest";
import { DocumentDriveServer } from "../../src";
import { PrismaStorage } from "../../src/storage/prisma";
import RedisCache from "../../src/cache/redis";
import { RedisQueue, RedisQueueManager } from "../../src/queue/redis";
import { PrismaClient } from "@prisma/client";
import { createClient, RedisClientType } from "redis";
import { actions } from "document-model-libs/document-drive"


describe("register many listeners with prisma and redis", () => {

    let driveServer: DocumentDriveServer;

    beforeAll(async () => {
        const prismaClient = new PrismaClient();
        const client = await createClient().connect();
        await client.flushAll()

        driveServer = new DocumentDriveServer(
            [],
            new PrismaStorage(prismaClient),
            new RedisCache(client as RedisClientType),
            new RedisQueueManager(1, 1000000000, client as RedisClientType),
        )

        await driveServer.initialize();
        await driveServer.addDrive({
            global: {
                icon: "icon",
                name: "test",
                slug: "test",
                id: "test",
            },
            local: {
                availableOffline: false,
                listeners: [],
                sharingType: "private",
                triggers: [],
            }
        });
    });

    it("should register many listeners and should not run out of memory", async () => {
        const promisses = []
        for (let i = 0; i < 1000; i++) {
            promisses.push(driveServer.queueDriveAction("test", actions.addListener({
                listener: {
                    block: false,
                    callInfo: {
                        data: null,
                        name: "test",
                        transmitterType: "PullResponder",
                    },
                    filter: {
                        branch: ["*"],
                        documentId: ["*"],
                        documentType: ["*"],
                        scope: ["*"],
                    },
                    label: "test",
                    listenerId: "test",
                    system: false,
                }
            })))
        }

        try {
            const result = await Promise.all(promisses)
            expect(result).not.toBe(null);
        } catch (e) {
            expect(e).toBe(null)
        }

    });

});
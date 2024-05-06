import { describe, it, vi } from "vitest";
import { Listener, ListenerManager, StrandUpdate, SubscriptionTransmitter, SynchronizationUnit } from "../../";

describe('Subscrition Transmitter', () => {

    it('should yield empty array on first call', async ({ expect }) => {
        const manager = {
            getStrands: vi.fn(() => [])
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        await transmitter.init();
        const generator = transmitter.strandsGenerator();
        const next = await generator.next();
        expect(next.value).toStrictEqual([]);
        expect(next.done).toBe(false);
    });

    it('should yield existing strands', async ({ expect }) => {
        const manager = {
            getStrands: vi.fn(() => [
                {
                    driveId: "1",
                    documentId: "1",
                    scope: "global",
                    branch: "main",
                    operations: [{
                        timestamp: "",
                        index: 0,
                        skip: 0,
                        type: "",
                        input: {},
                        hash: ""
                    }]
                } satisfies StrandUpdate
            ])
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        await transmitter.init();
        const generator = transmitter.strandsGenerator();
        const next = await generator.next();
        expect(next.value).toStrictEqual([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);
        expect(next.done).toBe(false);
    });

    it('should yield new strands', async ({ expect }) => {
        const strands: StrandUpdate[] = [
        ]
        const manager = {
            getStrands: vi.fn(() => strands)
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        const generator = transmitter.strandsGenerator();
        expect((await generator.next()).value).toStrictEqual([]);

        await transmitter.transmit([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }])

        expect((await generator.next()).value).toStrictEqual([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);
    });

    it('should wait for new strands before yielding again', async ({ expect }) => {
        const strands: StrandUpdate[] = [
            {
                driveId: "1",
                documentId: "1",
                scope: "global",
                branch: "main",
                operations: [{
                    timestamp: "",
                    index: 0,
                    skip: 0,
                    type: "",
                    input: {},
                    hash: ""
                }]
            }
        ]
        const manager = {
            getStrands: vi.fn(() => strands)
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        await transmitter.init();
        const generator = transmitter.strandsGenerator();
        const next = await generator.next();
        expect(next.value).toStrictEqual([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);
        expect(next.done).toBe(false);

        const next2 = generator.next();

        await expect(Promise.race([next2, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))])).rejects.toThrowError('Timeout');

        await transmitter.transmit([{
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }])

        expect((await next2).value).toStrictEqual([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        },
        {
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);
    });

    it('should not yield acknowledged strands', async ({ expect }) => {
        const strands: StrandUpdate[] = [];
        const manager = {
            getStrands: vi.fn(() => strands),
            getListenerSyncUnits: vi.fn(() => [{
                driveId: "1",
                documentId: "1",
                scope: "global",
                branch: "main", syncId: "1", documentType: "", lastUpdated: "", revision: 0
            } satisfies SynchronizationUnit]),
            updateListenerRevision: vi.fn(() => { strands.shift() }),
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        const generator = transmitter.strandsGenerator();
        expect((await generator.next()).value).toStrictEqual([]);

        const strand1: StrandUpdate = {
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }
        strands.push(strand1);
        await transmitter.transmit([strand1])

        const strand2: StrandUpdate = {
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        };
        strands.push(strand2);
        await transmitter.transmit([strand2])

        await transmitter.processAcknowledge("1", "", [{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            status: "SUCCESS",
            revision: 0
        }]);

        expect((await generator.next()).value).toStrictEqual([{
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);
    });

    it('should fetch strands from db on acknowledge', async ({ expect }) => {
        const manager = {
            getStrands: vi.fn(() => []),
            getListenerSyncUnits: vi.fn(() => [{
                driveId: "1",
                documentId: "1",
                scope: "global",
                branch: "main", syncId: "1", documentType: "", lastUpdated: "", revision: 0
            } satisfies SynchronizationUnit]),
            updateListenerRevision: vi.fn(() => { }),
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        const generator = transmitter.strandsGenerator();
        expect((await generator.next()).value).toStrictEqual([]);

        await transmitter.transmit([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }])

        expect(manager.getStrands).toBeCalledTimes(1);

        await transmitter.processAcknowledge("1", "", [{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            status: "SUCCESS",
            revision: 0
        }]);
        expect(manager.getStrands).toBeCalledTimes(2);

        await transmitter.processAcknowledge("1", "", []);
        expect(manager.getStrands).toBeCalledTimes(2);
    });

    it('should only fetch strands from db on init', async ({ expect }) => {
        const manager = {
            getStrands: vi.fn(() => []),
            getListenerSyncUnits: vi.fn(() => [])
        } as any as ListenerManager;
        const listener = {} as any as Listener;

        const transmitter = new SubscriptionTransmitter(listener, manager);
        const generator = transmitter.strandsGenerator();
        expect((await generator.next()).value).toStrictEqual([]);

        await transmitter.transmit([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }])

        expect((await generator.next()).value).toStrictEqual([{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }]);

        await transmitter.transmit([{
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }])

        const expectedStrands = [{
            driveId: "1",
            documentId: "1",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }, {
            driveId: "1",
            documentId: "2",
            scope: "global",
            branch: "main",
            operations: [{
                timestamp: "",
                index: 0,
                skip: 0,
                type: "",
                input: {},
                hash: ""
            }]
        }];

        expect((await generator.next()).value).toStrictEqual(expectedStrands);
        expect(manager.getStrands).toBeCalledTimes(1);
    });
});
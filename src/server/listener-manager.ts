import { Prisma } from '@prisma/client';

export class ListenerManager {
    private cache: any;
    private db: Prisma.TransactionClient;

    constructor(db: Prisma.TransactionClient) {
        this.db = db;
        this.initCache();
    }

    registerListener() {
      this.db.li
        //add to cache
    }

    removeListener() {}

    initCache() {
        // fetch sync units from db
        // fetch listener from db
    }

    pushStrands() {}

    pullStrands() {}
}

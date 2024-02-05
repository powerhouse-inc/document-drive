import { FilesystemStorage } from '../src/storage/filesystem';

const storage = new FilesystemStorage('./tmp');
async function test() {
    await storage.saveDrive({ state: { global: { id: '1' } } });
    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(
            storage.saveDocument('test', '123', {
                state: { global: { value: i } }
            })
        );
    }

    await Promise.all(promises);
}
test();

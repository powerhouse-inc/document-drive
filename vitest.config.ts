import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        server: {
            deps: {
                inline: ['document-model-libs']
            }
        },
        setupFiles: './test/vitest-setup.ts'
    }
});

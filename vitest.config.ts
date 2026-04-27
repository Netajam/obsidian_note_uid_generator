import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, 'tests/obsidian-stub.ts'),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});

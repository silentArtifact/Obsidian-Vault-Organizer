/**
 * Performance tests for the Obsidian Vault Organizer.
 * Benchmarks operations with large vaults (1000+ files).
 */

import { TFile, CachedMetadata } from 'obsidian';
import VaultOrganizer from '../main';
import {
	FrontmatterRule,
	matchFrontmatter,
	deserializeFrontmatterRules,
} from '../src/rules';

/**
 * Creates a mock TFile with the specified path and frontmatter.
 */
function createMockFile(
	path: string,
	frontmatter?: Record<string, any>
): { file: TFile; cache: CachedMetadata } {
	const file = new TFile() as any;
	file.path = path;
	file.name = path.split('/').pop() || '';
	file.basename = file.name.replace(/\.md$/, '');
	file.extension = 'md';

	const cache: CachedMetadata = {
		frontmatter: frontmatter || {},
	};

	return { file, cache };
}

/**
 * Creates a large set of mock files for performance testing.
 */
function createLargeMockVault(
	fileCount: number
): Array<{ file: TFile; cache: CachedMetadata }> {
	const files: Array<{ file: TFile; cache: CachedMetadata }> = [];
	const categories = ['work', 'personal', 'archive', 'projects', 'notes'];
	const statuses = ['todo', 'in-progress', 'done', 'archived'];

	for (let i = 0; i < fileCount; i++) {
		const category = categories[i % categories.length];
		const status = statuses[Math.floor(i / categories.length) % statuses.length];
		const path = `test-folder/file-${i}.md`;

		const frontmatter = {
			category,
			status,
			tags: `#tag${i % 10} #tag${i % 20}`,
			created: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
			index: i,
		};

		files.push(createMockFile(path, frontmatter));
	}

	return files;
}

describe('Performance Tests', () => {
	describe('matchFrontmatter performance', () => {
		it('should handle 1000 files with simple matching rules efficiently', () => {
			const files = createLargeMockVault(1000);
			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work-files',
					enabled: true,
				},
				{
					key: 'category',
					value: 'personal',
					matchType: 'equals',
					destination: 'personal-files',
					enabled: true,
				},
			];

			const startTime = performance.now();
			let matchCount = 0;

			// Create a minimal mock context for matchFrontmatter
			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			files.forEach(({ file }) => {
				const match = matchFrontmatter.call(mockContext as any, file, rules);
				if (match) {
					matchCount++;
				}
			});

			const endTime = performance.now();
			const duration = endTime - startTime;

			// Verify that matches were found
			expect(matchCount).toBeGreaterThan(0);

			// Performance assertion: should complete in under 1000ms (1 second)
			expect(duration).toBeLessThan(1000);

			console.log(
				`✓ Matched ${matchCount} files out of 1000 in ${duration.toFixed(2)}ms`
			);
			console.log(`  Average: ${(duration / 1000).toFixed(4)}ms per file`);
		});

		it('should handle 5000 files with regex matching rules efficiently', () => {
			const files = createLargeMockVault(5000);
			const rules: FrontmatterRule[] = [
				{
					key: 'tags',
					value: new RegExp('tag[0-5]', 'i'),
					matchType: 'regex',
					destination: 'tag-0-to-5',
					enabled: true,
				},
				{
					key: 'status',
					value: 'in-progress',
					matchType: 'contains',
					destination: 'active',
					enabled: true,
				},
			];

			const startTime = performance.now();
			let matchCount = 0;

			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			files.forEach(({ file }) => {
				const match = matchFrontmatter.call(mockContext as any, file, rules);
				if (match) {
					matchCount++;
				}
			});

			const endTime = performance.now();
			const duration = endTime - startTime;

			expect(matchCount).toBeGreaterThan(0);

			// Performance assertion: should complete in under 3000ms (3 seconds)
			expect(duration).toBeLessThan(3000);

			console.log(
				`✓ Matched ${matchCount} files out of 5000 in ${duration.toFixed(2)}ms`
			);
			console.log(`  Average: ${(duration / 5000).toFixed(4)}ms per file`);
		});

		it('should handle 10000 files with complex rule sets', () => {
			const files = createLargeMockVault(10000);
			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work',
					enabled: true,
				},
				{
					key: 'status',
					value: 'done',
					matchType: 'equals',
					destination: 'completed',
					enabled: true,
				},
				{
					key: 'tags',
					value: new RegExp('tag1[0-9]', 'i'),
					matchType: 'regex',
					destination: 'tags-10-19',
					enabled: true,
				},
				{
					key: 'created',
					value: '2024-01',
					matchType: 'starts-with',
					destination: 'january-2024',
					enabled: true,
				},
			];

			const startTime = performance.now();
			let matchCount = 0;

			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			files.forEach(({ file }) => {
				const match = matchFrontmatter.call(mockContext as any, file, rules);
				if (match) {
					matchCount++;
				}
			});

			const endTime = performance.now();
			const duration = endTime - startTime;

			expect(matchCount).toBeGreaterThan(0);

			// Performance assertion: should complete in under 5000ms (5 seconds)
			expect(duration).toBeLessThan(5000);

			console.log(
				`✓ Matched ${matchCount} files out of 10000 in ${duration.toFixed(2)}ms`
			);
			console.log(`  Average: ${(duration / 10000).toFixed(4)}ms per file`);
		});
	});

	describe('Rule deserialization performance', () => {
		it('should deserialize 100 rules quickly', () => {
			const serializedRules = Array.from({ length: 100 }, (_, i) => ({
				key: `key-${i}`,
				value: `value-${i}`,
				matchType: 'equals' as const,
				destination: `dest-${i}`,
				enabled: true,
			}));

			const startTime = performance.now();
			const result = deserializeFrontmatterRules(serializedRules);
			const endTime = performance.now();
			const duration = endTime - startTime;

			expect(result.rules).toHaveLength(100);
			expect(result.errors).toHaveLength(0);

			// Should complete in under 100ms
			expect(duration).toBeLessThan(100);

			console.log(`✓ Deserialized 100 rules in ${duration.toFixed(2)}ms`);
		});

		it('should deserialize 100 regex rules quickly', () => {
			const serializedRules = Array.from({ length: 100 }, (_, i) => ({
				key: `key-${i}`,
				value: `pattern-${i}.*`,
				matchType: 'regex' as const,
				destination: `dest-${i}`,
				enabled: true,
				isRegex: true,
				flags: 'i',
			}));

			const startTime = performance.now();
			const result = deserializeFrontmatterRules(serializedRules);
			const endTime = performance.now();
			const duration = endTime - startTime;

			expect(result.rules).toHaveLength(100);
			expect(result.errors).toHaveLength(0);

			// Should complete in under 200ms (regex compilation is more expensive)
			expect(duration).toBeLessThan(200);

			console.log(`✓ Deserialized 100 regex rules in ${duration.toFixed(2)}ms`);
		});
	});

	describe('Memory efficiency tests', () => {
		it('should not cause memory issues with 1000+ files', () => {
			const initialMemory = process.memoryUsage().heapUsed;
			const files = createLargeMockVault(1000);

			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work',
					enabled: true,
				},
			];

			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			// Process all files
			files.forEach(({ file }) => {
				matchFrontmatter.call(mockContext as any, file, rules);
			});

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // Convert to MB

			console.log(`✓ Memory increase: ${memoryIncrease.toFixed(2)} MB for 1000 files`);

			// Memory increase should be reasonable (less than 50MB for this operation)
			expect(memoryIncrease).toBeLessThan(50);
		});
	});

	describe('Stress tests', () => {
		it('should handle rapid sequential rule matching', () => {
			const files = createLargeMockVault(100);
			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work',
					enabled: true,
				},
			];

			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			const iterations = 100;
			const startTime = performance.now();

			// Simulate rapid sequential processing (e.g., file changes)
			for (let i = 0; i < iterations; i++) {
				files.forEach(({ file }) => {
					matchFrontmatter.call(mockContext as any, file, rules);
				});
			}

			const endTime = performance.now();
			const duration = endTime - startTime;
			const totalOperations = iterations * files.length;

			console.log(
				`✓ Processed ${totalOperations} operations in ${duration.toFixed(2)}ms`
			);
			console.log(`  Average: ${(duration / totalOperations).toFixed(4)}ms per operation`);

			// Should handle rapid operations efficiently
			expect(duration).toBeLessThan(5000);
		});

		it('should handle mixed workload (different match types)', () => {
			const files = createLargeMockVault(2000);

			// Mix of all match types
			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work',
					enabled: true,
				},
				{
					key: 'status',
					value: 'progress',
					matchType: 'contains',
					destination: 'active',
					enabled: true,
				},
				{
					key: 'created',
					value: '2024',
					matchType: 'starts-with',
					destination: '2024',
					enabled: true,
				},
				{
					key: 'tags',
					value: new RegExp('tag[0-9]+', 'i'),
					matchType: 'regex',
					destination: 'tagged',
					enabled: true,
				},
			];

			const mockContext = {
				app: {
					metadataCache: {
						getFileCache: (file: TFile) => {
							const matchingFile = files.find((f) => f.file.path === file.path);
							return matchingFile?.cache;
						},
					},
				},
			};

			const startTime = performance.now();
			let matchCount = 0;

			files.forEach(({ file }) => {
				const match = matchFrontmatter.call(mockContext as any, file, rules);
				if (match) {
					matchCount++;
				}
			});

			const endTime = performance.now();
			const duration = endTime - startTime;

			console.log(
				`✓ Mixed workload: ${matchCount} matches from 2000 files in ${duration.toFixed(2)}ms`
			);

			// Should complete efficiently
			expect(duration).toBeLessThan(2000);
		});
	});

	describe('Scalability benchmarks', () => {
		it('should scale linearly with file count', () => {
			const fileCounts = [100, 500, 1000, 2000];
			const timings: number[] = [];

			const rules: FrontmatterRule[] = [
				{
					key: 'category',
					value: 'work',
					matchType: 'equals',
					destination: 'work',
					enabled: true,
				},
			];

			fileCounts.forEach((count) => {
				const files = createLargeMockVault(count);

				const mockContext = {
					app: {
						metadataCache: {
							getFileCache: (file: TFile) => {
								const matchingFile = files.find((f) => f.file.path === file.path);
								return matchingFile?.cache;
							},
						},
					},
				};

				const startTime = performance.now();

				files.forEach(({ file }) => {
					matchFrontmatter.call(mockContext as any, file, rules);
				});

				const endTime = performance.now();
				timings.push(endTime - startTime);
			});

			console.log('\n✓ Scalability analysis:');
			fileCounts.forEach((count, i) => {
				console.log(
					`  ${count} files: ${timings[i].toFixed(2)}ms (${(timings[i] / count).toFixed(4)}ms per file)`
				);
			});

			// Check that we're scaling reasonably (not exponentially)
			// Time per file should remain relatively constant
			const timePerFile100 = timings[0] / fileCounts[0];
			const timePerFile2000 = timings[3] / fileCounts[3];
			const scalingFactor = timePerFile2000 / timePerFile100;

			console.log(`  Scaling factor: ${scalingFactor.toFixed(2)}x`);

			// Scaling factor should be less than 3.1x (allowing for some overhead and system variance)
			expect(scalingFactor).toBeLessThan(3.1);
		});
	});
});

import { matchFrontmatter } from '../src/rules';
import { TFile } from 'obsidian';
import type { FrontmatterRule } from '../src/rules';

describe('Security Tests', () => {
	describe('Prototype Pollution Protection', () => {
		let mockApp: any;
		let mockFile: any;

		beforeEach(() => {
			mockApp = {
				metadataCache: {
					getFileCache: jest.fn(),
				},
			};
			mockFile = new TFile('test.md');
		});

		it('should reject __proto__ key to prevent prototype pollution', () => {
			const frontmatter = {
				__proto__: 'malicious',
				status: 'done',
			};

			const rules: FrontmatterRule[] = [
				{
					key: '__proto__',
					value: 'malicious',
					matchType: 'equals',
					destination: 'Archive',
					enabled: true,
				},
			];

			const result = matchFrontmatter.call({ app: mockApp }, mockFile, rules, frontmatter);
			expect(result).toBeUndefined();
		});

		it('should reject constructor key to prevent prototype pollution', () => {
			const frontmatter = {
				constructor: 'malicious',
				status: 'done',
			};

			const rules: FrontmatterRule[] = [
				{
					key: 'constructor',
					value: 'malicious',
					matchType: 'equals',
					destination: 'Archive',
					enabled: true,
				},
			];

			const result = matchFrontmatter.call({ app: mockApp }, mockFile, rules, frontmatter);
			expect(result).toBeUndefined();
		});

		it('should reject prototype key to prevent prototype pollution', () => {
			const frontmatter = {
				prototype: 'malicious',
				status: 'done',
			};

			const rules: FrontmatterRule[] = [
				{
					key: 'prototype',
					value: 'malicious',
					matchType: 'equals',
					destination: 'Archive',
					enabled: true,
				},
			];

			const result = matchFrontmatter.call({ app: mockApp }, mockFile, rules, frontmatter);
			expect(result).toBeUndefined();
		});

		it('should allow normal keys that happen to contain dangerous strings', () => {
			const frontmatter = {
				proto_version: '1.0',
				status: 'done',
			};

			const rules: FrontmatterRule[] = [
				{
					key: 'proto_version',
					value: '1.0',
					matchType: 'equals',
					destination: 'Archive',
					enabled: true,
				},
			];

			const result = matchFrontmatter.call({ app: mockApp }, mockFile, rules, frontmatter);
			expect(result).toBeDefined();
			expect(result?.key).toBe('proto_version');
		});

		it('should process safe keys normally', () => {
			const frontmatter = {
				status: 'done',
				tags: ['work', 'urgent'],
			};

			const rules: FrontmatterRule[] = [
				{
					key: 'status',
					value: 'done',
					matchType: 'equals',
					destination: 'Archive',
					enabled: true,
				},
			];

			const result = matchFrontmatter.call({ app: mockApp }, mockFile, rules, frontmatter);
			expect(result).toBeDefined();
			expect(result?.key).toBe('status');
		});
	});
});

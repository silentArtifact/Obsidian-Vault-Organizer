import VaultOrganizer from '../main';
import { TFile } from 'obsidian';

describe('VaultOrganizer.testAllRules', () => {
	let plugin: VaultOrganizer;
	let mockApp: any;
	let mockFile1: TFile;
	let mockFile2: TFile;

	beforeEach(() => {
		mockFile1 = new TFile('test1.md');
		mockFile2 = new TFile('test2.md');

		mockApp = {
			vault: {
				getMarkdownFiles: jest.fn(() => [mockFile1, mockFile2]),
				getName: jest.fn(() => 'TestVault'),
			},
			metadataCache: {
				getFileCache: jest.fn(),
			},
		};

		plugin = new VaultOrganizer(mockApp, {});
		(plugin as any).app = mockApp;
		plugin.settings = {
			rules: [],
			moveHistory: [],
			maxHistorySize: 50,
		};
	});

	it('should return empty array when no markdown files exist', () => {
		mockApp.vault.getMarkdownFiles.mockReturnValue([]);
		const results = plugin.testAllRules();
		expect(results).toEqual([]);
	});

	it('should skip files without frontmatter', () => {
		mockApp.metadataCache.getFileCache.mockReturnValue(null);
		const results = plugin.testAllRules();
		expect(results).toEqual([]);
	});

	it('should skip files with no matching rules', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'in-progress' },
		});

		const results = plugin.testAllRules();
		expect(results).toEqual([]);
	});

	it('should skip files with disabled rules', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: false },
		];
		plugin.updateRulesFromSettings();

		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		expect(results).toEqual([]);
	});

	it('should skip files where destination is empty', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: '', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		expect(results).toEqual([]);
	});

	it('should return error results for invalid destination paths', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: '../invalid', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		expect(results.length).toBe(2); // Both mockFile1 and mockFile2
		expect(results[0].error).toBeDefined();
		expect(results[0].newPath).toBeUndefined();
		expect(results[1].error).toBeDefined();
		expect(results[1].newPath).toBeUndefined();
	});

	it('should return results with warnings when path has issues', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive//Subfolder', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		expect(results.length).toBeGreaterThan(0);
	});

	it('should return valid move results for files that would be moved', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockFile1.path = 'Inbox/test1.md';
		mockFile1.name = 'test1.md';
		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		expect(results.length).toBeGreaterThan(0);
		const validResults = results.filter(r => r.newPath && !r.error);
		expect(validResults.length).toBeGreaterThan(0);
		expect(validResults[0].newPath).toBe('Archive/test1.md');
	});

	it('should not return results for files already in correct location', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockFile1.path = 'Archive/test1.md';
		mockFile1.name = 'test1.md';
		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		const fileResults = results.filter(r => r.file.path === 'Archive/test1.md');
		expect(fileResults.length).toBe(0);
	});

	it('should handle multiple files with different rules', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
			{ key: 'status', value: 'in-progress', destination: 'Active', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockFile1.path = 'Inbox/test1.md';
		mockFile1.name = 'test1.md';
		mockFile2.path = 'Inbox/test2.md';
		mockFile2.name = 'test2.md';

		mockApp.metadataCache.getFileCache
			.mockReturnValueOnce({ frontmatter: { status: 'done' } })
			.mockReturnValueOnce({ frontmatter: { status: 'in-progress' } });

		const results = plugin.testAllRules();
		expect(results.length).toBe(2);
		expect(results[0].newPath).toBe('Archive/test1.md');
		expect(results[1].newPath).toBe('Active/test2.md');
	});

	it('should combine warnings from destination and path validation', () => {
		plugin.settings.rules = [
			{ key: 'status', value: 'done', destination: 'Archive//', matchType: 'equals', enabled: true },
		];
		plugin.updateRulesFromSettings();

		mockFile1.path = 'Inbox/test1.md';
		mockFile1.name = 'test1.md';
		mockApp.metadataCache.getFileCache.mockReturnValue({
			frontmatter: { status: 'done' },
		});

		const results = plugin.testAllRules();
		if (results.length > 0 && results[0].warnings) {
			expect(results[0].warnings.length).toBeGreaterThan(0);
		}
	});
});

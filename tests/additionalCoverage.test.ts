import VaultOrganizer from '../main';
import { TFile, TAbstractFile } from 'obsidian';

// Notice is auto-mocked by the obsidian mock

describe('Additional Coverage Tests', () => {
	let plugin: VaultOrganizer;
	let mockApp: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockApp = {
			vault: {
				getName: jest.fn(() => 'TestVault'),
				getAbstractFileByPath: jest.fn(),
				getMarkdownFiles: jest.fn(() => []),
				createFolder: jest.fn(),
			},
			metadataCache: {
				getFileCache: jest.fn(),
			},
			fileManager: {
				renameFile: jest.fn(),
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

	describe('undoLastMove edge cases', () => {
		it('should handle when file exists but is not a TFile', async () => {
			const mockFolder = new TAbstractFile();
			mockFolder.path = 'new/test.md';

			plugin.settings.moveHistory = [
				{
					timestamp: Date.now(),
					fileName: 'test.md',
					fromPath: 'old/test.md',
					toPath: 'new/test.md',
					ruleKey: 'status',
				},
			];

			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);

			await plugin.undoLastMove();

			// Verify the move history was cleared
			expect(plugin.settings.moveHistory.length).toBe(0);
		});

		it('should handle when file no longer exists at destination', async () => {
			plugin.settings.moveHistory = [
				{
					timestamp: Date.now(),
					fileName: 'test.md',
					fromPath: 'old/test.md',
					toPath: 'new/test.md',
					ruleKey: 'status',
				},
			];

			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

			await plugin.undoLastMove();

			// Verify the move history was cleared
			expect(plugin.settings.moveHistory.length).toBe(0);
		});

		it('should clear history when undo fails due to existing file at destination', async () => {
			const mockFile = new TFile('new/test.md');
			const mockConflictingFile = new TFile('old/test.md');

			plugin.settings.moveHistory = [
				{
					timestamp: Date.now(),
					fileName: 'test.md',
					fromPath: 'old/test.md',
					toPath: 'new/test.md',
					ruleKey: 'status',
				},
			];

			// First call: file exists at current location
			// Second call: conflicting file exists at original location
			mockApp.vault.getAbstractFileByPath
				.mockReturnValueOnce(mockFile)
				.mockReturnValueOnce(mockConflictingFile);

			await plugin.undoLastMove();

			// Verify the move history was cleared even though undo couldn't proceed
			expect(plugin.settings.moveHistory.length).toBe(0);
			// Verify rename was not called
			expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
		});
	});

	describe('applyRulesToFile debug mode with empty destination', () => {
		it('should show debug notice when destination is empty', async () => {
			plugin.settings.rules = [
				{ key: 'status', value: 'done', destination: '  ', matchType: 'equals', enabled: true, debug: true },
			];
			plugin.updateRulesFromSettings();

			const mockFile = new TFile('test.md');
			mockApp.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { status: 'done' },
			});

			await (plugin as any).applyRulesToFile(mockFile);

			// Debug mode should prevent file from being moved
			expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
		});
	});

	describe('ensureFolderExists validation failures', () => {
		it('should throw error when folder path validation fails', async () => {
			await expect((plugin as any).ensureFolderExists('../invalid')).rejects.toThrow();
		});

		it('should handle early return for empty folder paths', async () => {
			await (plugin as any).ensureFolderExists('');
			await (plugin as any).ensureFolderExists('.');
			await (plugin as any).ensureFolderExists('/');

			// Should not have called createFolder
			expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
		});
	});

	describe('applyRulesToFile with file path unchanged', () => {
		it('should return early when file is already in correct location', async () => {
			plugin.settings.rules = [
				{ key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
			];
			plugin.updateRulesFromSettings();

			const mockFile = new TFile('Archive/test.md');
			mockFile.path = 'Archive/test.md';
			mockFile.name = 'test.md';

			mockApp.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { status: 'done' },
			});

			await (plugin as any).applyRulesToFile(mockFile);

			expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
		});
	});

	describe('reorganizeAllMarkdownFiles', () => {
		it('should return early when no markdown files exist', async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue(null);
			await (plugin as any).reorganizeAllMarkdownFiles();
			// Should complete without error
		});

		it('should return early when markdown files array is empty', async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);
			await (plugin as any).reorganizeAllMarkdownFiles();
			// Should complete without error
		});
	});
});

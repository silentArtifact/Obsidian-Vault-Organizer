jest.mock('obsidian', () => {
  const actualObsidian = jest.requireActual('../__mocks__/obsidian');
  const NoticeMock = jest.fn();
  return {
    ...actualObsidian,
    Notice: NoticeMock,
  };
});

import VaultOrganizer from '../main';
import { TFile, Notice } from 'obsidian';

describe('Main error handling edge cases for improved coverage', () => {
  let plugin: VaultOrganizer;
  let app: any;
  let files: Map<string, TFile>;
  let fileCaches: Map<string, any>;

  beforeEach(async () => {
    (Notice as jest.Mock).mockClear();
    files = new Map();
    fileCaches = new Map();

    app = {
      vault: {
        getName: jest.fn(() => 'TestVault'),
        getAbstractFileByPath: jest.fn((path: string) => files.get(path) || null),
        getMarkdownFiles: jest.fn(() => Array.from(files.values())),
        createFolder: jest.fn(async (path: string) => {
          return { path, name: path.split('/').pop() || path };
        }),
        on: jest.fn(),
      },
      metadataCache: {
        getFileCache: jest.fn((file: TFile) => fileCaches.get(file.path)),
        on: jest.fn(),
      },
      fileManager: {
        renameFile: jest.fn(async (file: TFile, newPath: string) => {
          if (files.has(newPath)) {
            throw new Error('EEXIST: file already exists');
          }
          files.delete(file.path);
          file.path = newPath;
          file.name = newPath.split('/').pop() || newPath;
          files.set(newPath, file);
        }),
      },
    };

    const manifest = {
      id: 'vault-organizer',
      name: 'Vault Organizer',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      description: '',
      author: '',
      authorUrl: '',
      dir: 'vault-organizer',
      isDesktopOnly: false,
    };

    plugin = new VaultOrganizer(app, manifest as any);
    plugin.app = app;
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    plugin.loadData = jest.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
    plugin.updateRulesFromSettings();
  });

  it('handles path validation failure in applyRulesToFile', async () => {
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: '../../../etc', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    await (plugin as any).applyRulesToFile(file);

    // Should show error notice for invalid path
    expect(Notice as jest.Mock).toHaveBeenCalled();
    const noticeCall = (Notice as jest.Mock).mock.calls.find((call: any) =>
      call[0].toLowerCase().includes('path') || call[0].includes('traversal')
    );
    expect(noticeCall).toBeDefined();
  });

  it('handles errors in applyRulesToFile from file operations', async () => {
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: 'Test', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    // Mock fileManager.renameFile to throw an error
    const fileError = new Error('Filesystem error');
    app.fileManager.renameFile.mockRejectedValueOnce(fileError);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await (plugin as any).applyRulesToFile(file);

    // Should handle error (will be categorized)
    expect(Notice as jest.Mock).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('handles testAllRules with invalid destination path', async () => {
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: 'C:\\Windows\\System32', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    const results = plugin.testAllRules();

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    expect(result.error).toBeDefined();
    expect(result.newPath).toBeUndefined();
  });

  it('handles testAllRules with invalid combined path', async () => {
    // Use reserved Windows filename CON
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: 'Test', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'CON.md', // Reserved Windows filename
      basename: 'CON',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    const results = plugin.testAllRules();

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    // Result should have error or warnings
    expect(result.error || result.warnings).toBeDefined();
  });

  it('handles testAllRules with path warnings', async () => {
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: 'Test//Subfolder', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    const results = plugin.testAllRules();

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    // Should handle path with warnings (double slash)
    expect(result.newPath || result.error || result.warnings).toBeDefined();
  });

  it('handles full path validation error in applyRulesToFile', async () => {
    // Create a rule with a very long destination that will exceed path limits
    const longPath = 'a'.repeat(300);
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: longPath, enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await (plugin as any).applyRulesToFile(file);

    // Should handle path validation error
    expect(Notice as jest.Mock).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('handles VaultOrganizerError instances in applyRulesToFile', async () => {
    plugin.settings.rules = [
      { key: 'tag', matchType: 'equals', value: 'test', destination: 'Test', enabled: true, debug: false },
    ];
    plugin.updateRulesFromSettings();

    const file = {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    } as TFile;
    files.set(file.path, file);
    fileCaches.set(file.path, {
      frontmatter: { tag: 'test' },
    });

    // Mock createFolder to throw a categorized error
    const { VaultOrganizerError } = require('../src/errors');
    const vaultError = new VaultOrganizerError('Test vault error', 'Test', 'create-folder');
    app.vault.createFolder.mockRejectedValueOnce(vaultError);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await (plugin as any).applyRulesToFile(file);

    // Should handle VaultOrganizerError
    expect(Notice as jest.Mock).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Check that the error was logged (exact format may vary)
    const errorCall = consoleErrorSpy.mock.calls.find((call: any) =>
      call.some((arg: any) => String(arg).includes('Vault Organizer'))
    );
    expect(errorCall).toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it('handles root and empty paths in ensureFolderExists', async () => {
    // Test with root path
    await expect((plugin as any).ensureFolderExists('/')).resolves.toBeUndefined();
    await expect((plugin as any).ensureFolderExists('.')).resolves.toBeUndefined();
    await expect((plugin as any).ensureFolderExists('')).resolves.toBeUndefined();

    // Should not attempt to create folders for these paths
    expect(app.vault.createFolder).not.toHaveBeenCalled();
  });

  it('handles path with only empty segments after splitting', async () => {
    // Path "//" is detected as absolute and will throw an error
    // This tests the path validation error handling
    await expect((plugin as any).ensureFolderExists('//')).rejects.toThrow();

    // Should not create folder
    expect(app.vault.createFolder).not.toHaveBeenCalled();
  });

  it('handles reorganizeAllMarkdownFiles with no markdown files', async () => {
    files.clear();
    app.vault.getMarkdownFiles.mockReturnValue([]);

    await (plugin as any).reorganizeAllMarkdownFiles();

    // Should handle gracefully without errors
    expect(Notice as jest.Mock).not.toHaveBeenCalled();
  });

  it('handles reorganizeAllMarkdownFiles with undefined return', async () => {
    app.vault.getMarkdownFiles.mockReturnValue(undefined);

    await (plugin as any).reorganizeAllMarkdownFiles();

    // Should handle gracefully without errors
    expect(Notice as jest.Mock).not.toHaveBeenCalled();
  });
});

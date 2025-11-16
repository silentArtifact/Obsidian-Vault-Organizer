import './setupObsidian';
import { createMockFile, createMockVault, createMockMetadataCache, createMockFileManager, setupEventHandlers, setupFolderTracking, TEST_MANIFEST } from './testUtils';

import VaultOrganizer from '../main';
import { TFile, Notice } from 'obsidian';

describe('handleFileChange', () => {
  let metadataCache: { getFileCache: jest.Mock; on: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let vault: {
    on: jest.Mock;
    getName: jest.Mock;
    getAbstractFileByPath: jest.Mock;
    createFolder: jest.Mock;
    getMarkdownFiles: jest.Mock;
  };
  let plugin: VaultOrganizer;
  let handle: (file: any) => Promise<void>;
  let fileEventHandlers: Record<string, (file: any, ...args: any[]) => Promise<void> | void>;
  let addCommandMock: jest.Mock;
  let registeredCommands: any[];
  let eventHandlers: ReturnType<typeof setupEventHandlers>;
  const addRuleViaSettings = async (rule: any) => {
    plugin.settings.rules.splice(0, plugin.settings.rules.length);
    plugin.settings.rules.push({ enabled: true, ...rule });
    await plugin.saveSettingsAndRefreshRules();
  };

  beforeEach(async () => {
    // Setup mocks using shared utilities
    metadataCache = createMockMetadataCache();
    renameFile = jest.fn().mockResolvedValue(undefined);
    vault = createMockVault({ getName: jest.fn().mockReturnValue('Vault') });

    // Setup event handlers and folder tracking
    eventHandlers = setupEventHandlers(vault, metadataCache);
    fileEventHandlers = eventHandlers.fileEventHandlers;
    existingFolders = setupFolderTracking(vault);

    // Assign vault methods to local variables for test access
    createFolder = vault.createFolder;
    getAbstractFileByPath = vault.getAbstractFileByPath;

    // Setup app and plugin
    const app = {
      metadataCache,
      fileManager: createMockFileManager({ renameFile }),
      vault
    } as any;

    plugin = new VaultOrganizer(app, TEST_MANIFEST as any);
    plugin.addSettingTab = jest.fn();
    registeredCommands = [];
    addCommandMock = jest.fn((command) => { registeredCommands.push(command); return command; });
    (plugin as any).addCommand = addCommandMock;
    await plugin.onload();
    handle = fileEventHandlers['modify'] as typeof handle;
    expect(metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));
    expect(vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
    (Notice as jest.Mock).mockClear();
  });

  it('renames file when rule matches after saving settings', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal/' });
    expect((plugin as any).rules).toContainEqual(expect.objectContaining({ key: 'tag', value: 'journal', destination: 'Journal/' }));
    metadataCache.getFileCache.mockClear();
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
    expect(metadataCache.getFileCache).toHaveBeenCalledTimes(1);
  });

  it('skips rename when destination is blank', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: '   ' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('emits notice and skips rename when rule is debug', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal', debug: true });
    expect((plugin as any).rules).toContainEqual(expect.objectContaining({ key: 'tag', value: 'journal', destination: 'Journal', debug: true }));
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('DEBUG: Test would be moved to Vault/Journal');
  });

  it('ignores non-matching or same-path files', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'note' } });
    await handle(createMockFile('Temp/Test.md'));

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'journal' } });
    await handle(createMockFile('Journal/Test.md'));

    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('creates missing destination folders before renaming', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal/2023' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');

    await handle(file);

    expect(createFolder).toHaveBeenCalledWith('Journal');
    expect(createFolder).toHaveBeenCalledWith('Journal/2023');
    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/2023/Test.md');
    const lastFolderCall = createFolder.mock.invocationCallOrder[createFolder.mock.calls.length - 1];
    const renameCallOrder = renameFile.mock.invocationCallOrder[0];
    expect(lastFolderCall).toBeLessThan(renameCallOrder);
  });

  it('shows a failure notice when renaming fails', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');
    const renameError = new Error('rename failed');
    renameFile.mockRejectedValueOnce(renameError);
    // Expected errors are now logged at warn level with Logger
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handle(file);

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
    // Updated to match new error categorization format
    expect(Notice).toHaveBeenCalledWith('Failed to move "Temp/Test.md": rename failed.');
    // Logger now formats as: [Vault Organizer] WARN: message context
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Vault Organizer] WARN:'),
      expect.stringContaining('Expected error'),
      expect.anything()
    );

    consoleWarnSpy.mockRestore();
  });

  it('shows a create-folder failure notice when folder creation fails', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createMockFile('Temp/Test.md');
    const folderError = new Error('permission denied');
    createFolder.mockImplementationOnce(async () => {
      throw folderError;
    });
    // Expected errors are now logged at warn level with Logger
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handle(file);

    expect(createFolder).toHaveBeenCalledWith('Journal');
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith(
      'Permission denied: Cannot create folder "Journal". Check file permissions and try again.'
    );
    // Logger format: [Vault Organizer] WARN: message context
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Vault Organizer] WARN:'),
      expect.stringContaining('Expected error'),
      expect.anything()
    );

    consoleWarnSpy.mockRestore();
  });

  it('applies rules to existing files via command', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createMockFile('Temp/Test.md');
    (plugin.app.vault.getMarkdownFiles as jest.Mock).mockReturnValue([file]);
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });

    const command = registeredCommands.find(cmd => cmd.id === 'obsidian-vault-organizer-apply-rules');
    expect(command).toBeDefined();
    await command.callback();

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('applies rules after metadata cache resolves frontmatter', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createMockFile('Temp/Test.md');

    metadataCache.getFileCache
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ frontmatter: { tag: 'journal' } });

    await handle(file);

    expect(renameFile).not.toHaveBeenCalled();
    expect(eventHandlers.metadataChangedHandler).toBeDefined();

    await eventHandlers.metadataChangedHandler?.(file);

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('applies rules when files are renamed', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createMockFile('Temp/Test.md');

    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });

    const renameHandler = fileEventHandlers['rename'];
    expect(renameHandler).toBeDefined();

    await renameHandler?.(file, 'Old/Test.md');

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('omits invalid preview entries for reserved destinations', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'CON' });

    const file = createMockFile('Temp/Test.md');
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    vault.getMarkdownFiles.mockReturnValue([file]);

    const results = plugin.testAllRules();

    expect(results).toHaveLength(1);
    expect(results[0].ruleIndex).toBe(0);
    expect(results[0].newPath).toBeUndefined();
    expect(results[0].error).toBeDefined();
    expect(results[0].error?.getUserMessage()).toContain('reserved');
  });
});

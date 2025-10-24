jest.mock('obsidian', () => {
  const noticeMock = jest.fn();
  class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop()!;
      const parts = this.name.split('.');
      this.basename = parts.slice(0, -1).join('.') || this.name;
      this.extension = parts.length > 1 ? parts.pop()! : '';
    }
  }
  const debounce = <T extends (...args: any[]) => any>(fn: T, timeout = 0) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    const debounced: any = (...args: Parameters<T>) => {
      lastArgs = args;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        lastArgs && fn(...lastArgs);
      }, timeout);
      return debounced;
    };
    debounced.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return debounced;
    };
    debounced.run = () => {
      if (timer) {
        clearTimeout(timer);
        const args = lastArgs;
        timer = null;
        if (args) {
          return fn(...args);
        }
      }
    };
    return debounced;
  };

  return {
    App: class {},
    Plugin: class {
      app: any;
      manifest: any;
      constructor(app: any, manifest: any) {
        this.app = app;
        this.manifest = manifest;
      }
      loadData() { return Promise.resolve(undefined); }
      saveData() { return Promise.resolve(); }
      addSettingTab() {}
      registerEvent() {}
      addCommand() {}
    },
    TFile,
    normalizePath: (p: string) => require('path').posix.normalize(p.replace(/\\/g, '/')),
    Notice: noticeMock,
    Modal: class {
      app: any;
      contentEl: any = {
        empty: jest.fn(),
        createEl: jest.fn(),
        createDiv: jest.fn(),
      };
      open() {}
      close() {}
      onOpen() {}
      onClose() {}
    },
    PluginSettingTab: class { constructor(app: any, plugin: any) {} },
    Setting: class {
      setName() { return this; }
      setDesc() { return this; }
      addText() { return this; }
      addToggle() { return this; }
      addButton() { return this; }
    },
    FuzzySuggestModal: class {
      constructor(_app: any) {}
      open() {}
    },
    TAbstractFile: class {},
    debounce,
    getAllTags: jest.fn(() => []),
  };
}, { virtual: true });

import VaultOrganizer from '../main';
import { TFile, Notice } from 'obsidian';

const createTFile = (path: string): TFile => new (TFile as unknown as { new(path: string): TFile })(path);

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
  let metadataChangedHandler: ((file: any) => Promise<void> | void) | undefined;
  const addRuleViaSettings = async (rule: any) => {
    plugin.settings.rules.splice(0, plugin.settings.rules.length);
    plugin.settings.rules.push({ enabled: true, ...rule });
    await plugin.saveSettingsAndRefreshRules();
  };

  beforeEach(async () => {
    metadataChangedHandler = undefined;
    fileEventHandlers = {};
    metadataCache = {
      getFileCache: jest.fn(),
      on: jest.fn((event: string, cb: (file: any) => Promise<void> | void) => {
        if (event === 'changed') {
          metadataChangedHandler = cb;
        }
        return {};
      }),
    };
    renameFile = jest.fn().mockResolvedValue(undefined);
    existingFolders = new Set<string>();
    getAbstractFileByPath = jest.fn((path: string) => existingFolders.has(path) ? ({ path }) : null);
    createFolder = jest.fn(async (path: string) => {
      existingFolders.add(path);
    });
    vault = {
      on: jest.fn((event: string, cb: any) => {
        fileEventHandlers[event] = cb;
        return {};
      }),
      getName: jest.fn().mockReturnValue('Vault'),
      getAbstractFileByPath,
      createFolder,
      getMarkdownFiles: jest.fn().mockReturnValue([]),
    };
    const app = { metadataCache, fileManager: { renameFile }, vault } as any;
    const manifest = {
      id: 'obsidian-vault-organizer',
      name: 'Vault Organizer',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      description: '',
      author: '',
      authorUrl: '',
      dir: 'vault-organizer',
      isDesktopOnly: false,
    } as const;
    plugin = new VaultOrganizer(app, manifest as any);
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
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createTFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('skips rename when destination is blank', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: '   ' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createTFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('emits notice and skips rename when rule is debug', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal', debug: true });
    expect((plugin as any).rules).toContainEqual(expect.objectContaining({ key: 'tag', value: 'journal', destination: 'Journal', debug: true }));
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createTFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('DEBUG: Test would be moved to Vault/Journal');
  });

  it('ignores non-matching or same-path files', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'note' } });
    await handle(createTFile('Temp/Test.md'));

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'journal' } });
    await handle(createTFile('Journal/Test.md'));

    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('creates missing destination folders before renaming', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal/2023' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = createTFile('Temp/Test.md');

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
    const file = createTFile('Temp/Test.md');
    const renameError = new Error('rename failed');
    renameFile.mockRejectedValueOnce(renameError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handle(file);

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
    // Updated to match new error categorization format
    expect(Notice).toHaveBeenCalledWith('Failed to move "Temp/Test.md": rename failed.');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Vault Organizer]'),
      expect.anything(),
      expect.anything()
    );

    consoleErrorSpy.mockRestore();
  });

  it('applies rules to existing files via command', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createTFile('Temp/Test.md');
    (plugin.app.vault.getMarkdownFiles as jest.Mock).mockReturnValue([file]);
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });

    const command = registeredCommands.find(cmd => cmd.id === 'obsidian-vault-organizer-apply-rules');
    expect(command).toBeDefined();
    await command.callback();

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('applies rules after metadata cache resolves frontmatter', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createTFile('Temp/Test.md');

    metadataCache.getFileCache
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ frontmatter: { tag: 'journal' } });

    await handle(file);

    expect(renameFile).not.toHaveBeenCalled();
    expect(metadataChangedHandler).toBeDefined();

    await metadataChangedHandler?.(file);

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('applies rules when files are renamed', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = createTFile('Temp/Test.md');

    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });

    const renameHandler = fileEventHandlers['rename'];
    expect(renameHandler).toBeDefined();

    await renameHandler?.(file, 'Old/Test.md');

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('omits invalid preview entries for reserved destinations', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'CON' });

    const file = createTFile('Temp/Test.md');
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

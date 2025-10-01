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
      constructor(app: any) { this.app = app; }
      loadData() { return Promise.resolve(undefined); }
      saveData() { return Promise.resolve(); }
      addSettingTab() {}
      registerEvent() {}
      addCommand() {}
    },
    TFile,
    normalizePath: (p: string) => require('path').posix.normalize(p.replace(/\\/g, '/')),
    Notice: noticeMock,
    PluginSettingTab: class { constructor(app: any, plugin: any) {} },
    Setting: class {
      setName() { return this; }
      setDesc() { return this; }
      addText() { return this; }
      addToggle() { return this; }
      addButton() { return this; }
    },
    TAbstractFile: class {},
    debounce,
  };
}, { virtual: true });

import VaultOrganizer from '../main';
import { TFile, Notice } from 'obsidian';

describe('handleFileChange', () => {
  let metadataCache: { getFileCache: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let plugin: VaultOrganizer;
  let handle: (file: any) => Promise<void>;
  let addCommandMock: jest.Mock;
  let registeredCommands: any[];
  const addRuleViaSettings = async (rule: any) => {
    plugin.settings.rules.splice(0, plugin.settings.rules.length);
    plugin.settings.rules.push(rule);
    await plugin.saveSettingsAndRefreshRules();
  };

  beforeEach(async () => {
    metadataCache = { getFileCache: jest.fn() };
    renameFile = jest.fn().mockResolvedValue(undefined);
    existingFolders = new Set<string>();
    getAbstractFileByPath = jest.fn((path: string) => existingFolders.has(path) ? ({ path }) : null);
    createFolder = jest.fn(async (path: string) => {
      existingFolders.add(path);
    });
    const vault = {
      on: jest.fn((_: string, cb: any) => { handle = cb; }),
      getName: jest.fn().mockReturnValue('Vault'),
      getAbstractFileByPath,
      createFolder,
      getMarkdownFiles: jest.fn().mockReturnValue([]),
    };
    const app = { metadataCache, fileManager: { renameFile }, vault } as any;
    plugin = new VaultOrganizer(app);
    plugin.addSettingTab = jest.fn();
    registeredCommands = [];
    addCommandMock = jest.fn((command) => { registeredCommands.push(command); return command; });
    (plugin as any).addCommand = addCommandMock;
    await plugin.onload();
    (Notice as jest.Mock).mockClear();
  });

  it('renames file when rule matches after saving settings', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal/' });
    expect((plugin as any).rules).toContainEqual(expect.objectContaining({ key: 'tag', value: 'journal', destination: 'Journal/' }));
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = new TFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });

  it('skips rename when destination is blank', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: '   ' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = new TFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('emits notice and skips rename when rule is debug', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal', debug: true });
    expect((plugin as any).rules).toContainEqual(expect.objectContaining({ key: 'tag', value: 'journal', destination: 'Journal', debug: true }));
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = new TFile('Temp/Test.md');
    await handle(file);
    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('DEBUG: Test would be moved to Vault/Journal');
  });

  it('ignores non-matching or same-path files', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'note' } });
    await handle(new TFile('Temp/Test.md'));

    metadataCache.getFileCache.mockReturnValueOnce({ frontmatter: { tag: 'journal' } });
    await handle(new TFile('Journal/Test.md'));

    expect(renameFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });

  it('creates missing destination folders before renaming', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal/2023' });
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const file = new TFile('Temp/Test.md');

    await handle(file);

    expect(createFolder).toHaveBeenCalledWith('Journal');
    expect(createFolder).toHaveBeenCalledWith('Journal/2023');
    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/2023/Test.md');
    const lastFolderCall = createFolder.mock.invocationCallOrder[createFolder.mock.calls.length - 1];
    const renameCallOrder = renameFile.mock.invocationCallOrder[0];
    expect(lastFolderCall).toBeLessThan(renameCallOrder);
  });

  it('applies rules to existing files via command', async () => {
    await addRuleViaSettings({ key: 'tag', value: 'journal', destination: 'Journal' });
    const file = new TFile('Temp/Test.md');
    (plugin.app.vault.getMarkdownFiles as jest.Mock).mockReturnValue([file]);
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });

    const command = registeredCommands.find(cmd => cmd.id === 'obsidian-vault-organizer-apply-rules');
    expect(command).toBeDefined();
    await command.callback();

    expect(renameFile).toHaveBeenCalledWith(file, 'Journal/Test.md');
  });
});

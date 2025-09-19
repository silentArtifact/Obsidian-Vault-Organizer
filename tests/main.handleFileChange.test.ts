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
  return {
    App: class {},
    Plugin: class {
      app: any;
      constructor(app: any) { this.app = app; }
      loadData() { return Promise.resolve(undefined); }
      saveData() { return Promise.resolve(); }
      addSettingTab() {}
      registerEvent() {}
    },
    TFile,
    normalizePath: (p: string) => require('path').posix.normalize(p.replace(/\\/g, '/')),
    Notice: noticeMock,
    PluginSettingTab: class { constructor(app: any, plugin: any) {} },
    Setting: class {},
    TAbstractFile: class {},
  };
}, { virtual: true });

import VaultOrganizer from '../main';
import { TFile, Notice } from 'obsidian';

describe('handleFileChange', () => {
  let metadataCache: { getFileCache: jest.Mock };
  let renameFile: jest.Mock;
  let plugin: VaultOrganizer;
  let handle: (file: any) => Promise<void>;
  const addRuleViaSettings = async (rule: any) => {
    plugin.settings.rules.splice(0, plugin.settings.rules.length);
    plugin.settings.rules.push(rule);
    await plugin.saveSettingsAndRefreshRules();
  };

  beforeEach(async () => {
    metadataCache = { getFileCache: jest.fn() };
    renameFile = jest.fn().mockResolvedValue(undefined);
    const vault = {
      on: jest.fn((_: string, cb: any) => { handle = cb; }),
      getName: jest.fn().mockReturnValue('Vault'),
    };
    const app = { metadataCache, fileManager: { renameFile }, vault } as any;
    plugin = new VaultOrganizer(app);
    plugin.addSettingTab = jest.fn();
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
});

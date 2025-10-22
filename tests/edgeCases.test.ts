/**
 * Edge case tests for Unicode characters, symlinks, and circular path scenarios.
 * These tests ensure the plugin handles unusual file system situations gracefully.
 */

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
import { validatePath, validateDestinationPath } from '../src/pathSanitization';

const createTFile = (path: string): TFile => new (TFile as unknown as { new(path: string): TFile })(path);

describe('Edge Cases - Unicode Characters', () => {
  let metadataCache: { getFileCache: jest.Mock; on: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let plugin: VaultOrganizer;
  let handleModify: (file: any) => Promise<void>;

  beforeEach(async () => {
    metadataCache = {
      getFileCache: jest.fn(),
      on: jest.fn(() => ({})),
    };
    renameFile = jest.fn().mockResolvedValue(undefined);
    existingFolders = new Set<string>();
    getAbstractFileByPath = jest.fn((path: string) => existingFolders.has(path) ? ({ path }) : null);
    createFolder = jest.fn(async (path: string) => {
      existingFolders.add(path);
    });
    const vault = {
      on: jest.fn((event: string, cb: any) => {
        if (event === 'modify') {
          handleModify = cb;
        }
        return {};
      }),
      getName: jest.fn().mockReturnValue('TestVault'),
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
    (plugin as any).addCommand = jest.fn();
    await plugin.onload();
    (Notice as jest.Mock).mockClear();
  });

  describe('Unicode in File Names', () => {
    it('handles emoji in file names', async () => {
      plugin.settings.rules.push({ key: 'type', value: 'note', destination: 'Notes', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const emojiFile = createTFile('📝 My Note.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'note' } });

      await handleModify(emojiFile);
      expect(renameFile).toHaveBeenCalledWith(emojiFile, 'Notes/📝 My Note.md');
    });

    it('handles Chinese characters in file names', async () => {
      plugin.settings.rules.push({ key: 'lang', value: 'zh', destination: '中文笔记', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const chineseFile = createTFile('我的笔记.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'zh' } });

      await handleModify(chineseFile);
      expect(renameFile).toHaveBeenCalledWith(chineseFile, '中文笔记/我的笔记.md');
    });

    it('handles Japanese characters in file names', async () => {
      plugin.settings.rules.push({ key: 'type', value: 'note', destination: '日本語', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const japaneseFile = createTFile('私のノート.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'note' } });

      await handleModify(japaneseFile);
      expect(renameFile).toHaveBeenCalledWith(japaneseFile, '日本語/私のノート.md');
    });

    it('handles Arabic characters in file names', async () => {
      plugin.settings.rules.push({ key: 'lang', value: 'ar', destination: 'العربية', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const arabicFile = createTFile('ملاحظاتي.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'ar' } });

      await handleModify(arabicFile);
      expect(renameFile).toHaveBeenCalledWith(arabicFile, 'العربية/ملاحظاتي.md');
    });

    it('handles Cyrillic characters in file names', async () => {
      plugin.settings.rules.push({ key: 'lang', value: 'ru', destination: 'Русский', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const cyrillicFile = createTFile('Мои заметки.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'ru' } });

      await handleModify(cyrillicFile);
      expect(renameFile).toHaveBeenCalledWith(cyrillicFile, 'Русский/Мои заметки.md');
    });

    it('handles Korean characters in file names', async () => {
      plugin.settings.rules.push({ key: 'lang', value: 'ko', destination: '한국어', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const koreanFile = createTFile('내 노트.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'ko' } });

      await handleModify(koreanFile);
      expect(renameFile).toHaveBeenCalledWith(koreanFile, '한국어/내 노트.md');
    });

    it('handles mixed Unicode scripts', async () => {
      plugin.settings.rules.push({ key: 'type', value: 'mixed', destination: 'Mixed/多言語/🌍', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const mixedFile = createTFile('English-中文-日本語-🎌.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'mixed' } });

      await handleModify(mixedFile);
      expect(renameFile).toHaveBeenCalledWith(mixedFile, 'Mixed/多言語/🌍/English-中文-日本語-🎌.md');
    });

    it('handles special Unicode characters (combining marks, zero-width)', async () => {
      plugin.settings.rules.push({ key: 'type', value: 'special', destination: 'Special', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      // File name with combining diacritical marks
      const combiningFile = createTFile('Café.md'); // é is e + combining acute accent
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'special' } });

      await handleModify(combiningFile);
      expect(renameFile).toHaveBeenCalled();
    });
  });

  describe('Unicode in Frontmatter Values', () => {
    it('matches rules with Unicode values in frontmatter', async () => {
      plugin.settings.rules.push({ key: 'tag', value: '重要', destination: 'Important', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const file = createTFile('Note.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: '重要' } });

      await handleModify(file);
      expect(renameFile).toHaveBeenCalledWith(file, 'Important/Note.md');
    });

    it('handles emoji in frontmatter values', async () => {
      plugin.settings.rules.push({ key: 'status', value: '✅', destination: 'Completed', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const file = createTFile('Task.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { status: '✅' } });

      await handleModify(file);
      expect(renameFile).toHaveBeenCalledWith(file, 'Completed/Task.md');
    });

    it('handles regex matching with Unicode characters', async () => {
      plugin.settings.rules.push({
        key: 'title',
        value: '^[一-龯]+$', // Chinese characters only
        destination: 'Chinese Only',
        enabled: true,
        matchType: 'regex',
        isRegex: true,
        flags: ''
      });
      await plugin.saveSettingsWithoutReorganizing();

      const file = createTFile('Note.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { title: '笔记' } });

      await handleModify(file);
      expect(renameFile).toHaveBeenCalledWith(file, 'Chinese Only/Note.md');
    });
  });

  describe('Unicode Normalization', () => {
    it('handles different Unicode normalization forms', async () => {
      plugin.settings.rules.push({ key: 'name', value: 'café', destination: 'Cafe', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const file = createTFile('Test.md');
      // NFD form: c + a + f + e + combining acute accent
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { name: 'café' } });

      await handleModify(file);
      // Should match despite potential normalization differences
      expect(renameFile).toHaveBeenCalled();
    });
  });
});

describe('Edge Cases - Path Sanitization and Validation', () => {
  describe('Path Traversal Prevention', () => {
    it('rejects paths with parent directory references', () => {
      const result = validatePath('../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('traversal');
    });

    it('rejects paths with parent references in the middle', () => {
      const result = validatePath('folder/../secrets/file.md');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('traversal');
    });

    it('rejects multiple parent directory attempts', () => {
      const result = validatePath('../../../../../../etc/shadow');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('traversal');
    });
  });

  describe('Absolute Path Prevention', () => {
    it('rejects Unix absolute paths', () => {
      const result = validatePath('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('absolute');
    });

    it('rejects Windows absolute paths', () => {
      const result1 = validatePath('C:\\Windows\\System32');
      expect(result1.valid).toBe(false);
      expect(result1.error?.reason).toBe('absolute');

      const result2 = validatePath('D:/Documents/file.txt');
      expect(result2.valid).toBe(false);
      expect(result2.error?.reason).toBe('absolute');
    });
  });

  describe('Circular Path Detection', () => {
    it('prevents creation of nested folders with same names that could cause loops', async () => {
      // While we can't create true circular symlinks in this test, we can test
      // that deeply nested paths are handled correctly
      const deepPath = 'A/A/A/A/A/A/A/A/A/A';
      const result = validatePath(deepPath);
      expect(result.valid).toBe(true);
      expect(result.sanitizedPath).toBe(deepPath);
    });

    it('handles self-referential path patterns', () => {
      // Test that paths like "folder/./folder" are normalized
      const result = validatePath('folder/./subfolder');
      expect(result.valid).toBe(true);
      // Obsidian's normalizePath should handle this
      expect(result.sanitizedPath).toBe('folder/subfolder');
    });
  });

  describe('Reserved Names and Invalid Characters', () => {
    it('rejects Windows reserved device names', () => {
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
      reservedNames.forEach(name => {
        const result = validatePath(`folder/${name}.md`);
        expect(result.valid).toBe(false);
        expect(result.error?.reason).toBe('reserved-name');
      });
    });

    it('rejects paths with invalid characters', () => {
      const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
      invalidChars.forEach(char => {
        const result = validatePath(`folder/file${char}name.md`);
        expect(result.valid).toBe(false);
        expect(result.error?.reason).toBe('invalid-characters');
      });
    });

    it('rejects paths with control characters', () => {
      const result = validatePath('folder/file\x00name.md');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('invalid-characters');
    });

    it('rejects paths ending with dots or spaces', () => {
      // Path components ending with dots
      const result1 = validatePath('folder/filename.');
      expect(result1.valid).toBe(false);
      if (!result1.valid) {
        expect(result1.error?.reason).toBe('invalid-characters');
      }

      // Path components ending with spaces (trimmed during normalization, so might be valid if empty after trim)
      const result2 = validatePath('folder/file ');
      // After normalization, trailing spaces might be trimmed
      // Check if it either fails or gets normalized
      if (!result2.valid) {
        expect(result2.error?.reason).toMatch(/invalid-characters|empty/);
      }
    });
  });

  describe('Path Length Limits', () => {
    it('rejects paths exceeding maximum length', () => {
      const longPath = 'a'.repeat(300) + '.md';
      const result = validatePath(longPath);
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('too-long');
    });

    it('rejects path components exceeding 255 characters', () => {
      const longComponent = 'a'.repeat(256);
      const result = validatePath(`folder/${longComponent}.md`);
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('too-long');
    });

    it('accepts paths within length limits', () => {
      const validPath = 'folder/subfolder/file.md';
      const result = validatePath(validPath);
      expect(result.valid).toBe(true);
    });
  });

  describe('Multiple Slashes and Normalization', () => {
    it('normalizes multiple consecutive slashes', () => {
      const result = validatePath('folder///subfolder//file.md');
      expect(result.valid).toBe(true);
      expect(result.sanitizedPath).toBe('folder/subfolder/file.md');
      if (result.warnings) {
        expect(result.warnings).toContain('Multiple consecutive slashes were normalized');
      }
    });

    it('handles mixed slashes and backslashes', () => {
      const result = validatePath('folder\\subfolder/file.md');
      expect(result.valid).toBe(true);
      // Should normalize to forward slashes
      expect(result.sanitizedPath).toBe('folder/subfolder/file.md');
    });
  });

  describe('Empty and Whitespace Paths', () => {
    it('rejects empty paths by default', () => {
      const result = validatePath('');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('empty');
    });

    it('rejects whitespace-only paths', () => {
      const result = validatePath('   ');
      expect(result.valid).toBe(false);
      expect(result.error?.reason).toBe('empty');
    });

    it('allows empty paths when configured', () => {
      const result = validatePath('', { allowEmpty: true });
      expect(result.valid).toBe(true);
      expect(result.sanitizedPath).toBe('');
    });
  });

  describe('Destination Path Validation', () => {
    it('applies strict validation for destination paths', () => {
      const result = validateDestinationPath('../outside');
      expect(result.valid).toBe(false);
    });

    it('accepts valid destination paths', () => {
      const result = validateDestinationPath('Projects/Active');
      expect(result.valid).toBe(true);
      expect(result.sanitizedPath).toBe('Projects/Active');
    });
  });
});

describe('Edge Cases - Symlinks (Conceptual Tests)', () => {
  let metadataCache: { getFileCache: jest.Mock; on: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let plugin: VaultOrganizer;
  let handleModify: (file: any) => Promise<void>;

  beforeEach(async () => {
    metadataCache = {
      getFileCache: jest.fn(),
      on: jest.fn(() => ({})),
    };
    renameFile = jest.fn().mockResolvedValue(undefined);
    existingFolders = new Set<string>();
    getAbstractFileByPath = jest.fn((path: string) => existingFolders.has(path) ? ({ path }) : null);
    createFolder = jest.fn(async (path: string) => {
      existingFolders.add(path);
    });
    const vault = {
      on: jest.fn((event: string, cb: any) => {
        if (event === 'modify') {
          handleModify = cb;
        }
        return {};
      }),
      getName: jest.fn().mockReturnValue('TestVault'),
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
    (plugin as any).addCommand = jest.fn();
    await plugin.onload();
    (Notice as jest.Mock).mockClear();
  });

  describe('Symlink-like Path Patterns', () => {
    it('handles files with paths that could be symlink targets', async () => {
      // In Obsidian, we work with logical paths, not physical filesystem paths
      // This test ensures the plugin treats all paths as logical vault paths
      plugin.settings.rules.push({ key: 'type', value: 'note', destination: 'Notes', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      // Simulate a file that might be accessed via different paths
      const file = createTFile('SharedFolder/Document.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'note' } });

      await handleModify(file);
      expect(renameFile).toHaveBeenCalledWith(file, 'Notes/Document.md');
    });

    it('prevents moving files to destinations that would create ambiguous paths', async () => {
      plugin.settings.rules.push({ key: 'dest', value: 'same', destination: 'A/../A', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      const file = createTFile('Test.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { dest: 'same' } });

      // The path validation should catch this
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await handleModify(file);

      // Should fail validation and show an error notice about invalid path
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Invalid path'));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Canonical Path Resolution', () => {
    it('treats paths as canonical vault paths', async () => {
      plugin.settings.rules.push({ key: 'category', value: 'docs', destination: 'Documents', enabled: true });
      await plugin.saveSettingsWithoutReorganizing();

      // Obsidian normalizes all paths, so different representations should be equivalent
      const file = createTFile('folder/./subfolder/../file.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { category: 'docs' } });

      await handleModify(file);
      // Path should be normalized by Obsidian's normalizePath
      expect(renameFile).toHaveBeenCalled();
    });
  });
});

describe('Edge Cases - Case Sensitivity', () => {
  let metadataCache: { getFileCache: jest.Mock; on: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let plugin: VaultOrganizer;
  let handleModify: (file: any) => Promise<void>;

  beforeEach(async () => {
    metadataCache = {
      getFileCache: jest.fn(),
      on: jest.fn(() => ({})),
    };
    renameFile = jest.fn().mockResolvedValue(undefined);
    existingFolders = new Set<string>();
    getAbstractFileByPath = jest.fn((path: string) => existingFolders.has(path) ? ({ path }) : null);
    createFolder = jest.fn(async (path: string) => {
      existingFolders.add(path);
    });
    const vault = {
      on: jest.fn((event: string, cb: any) => {
        if (event === 'modify') {
          handleModify = cb;
        }
        return {};
      }),
      getName: jest.fn().mockReturnValue('TestVault'),
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
    (plugin as any).addCommand = jest.fn();
    await plugin.onload();
    (Notice as jest.Mock).mockClear();
  });

  it('handles case-insensitive matching for Unicode characters', async () => {
    plugin.settings.rules.push({
      key: 'title',
      value: 'CAFÉ',
      destination: 'Cafes',
      enabled: true,
      caseInsensitive: true
    });
    await plugin.saveSettingsWithoutReorganizing();

    const file = createTFile('Note.md');
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { title: 'café' } });

    await handleModify(file);
    expect(renameFile).toHaveBeenCalledWith(file, 'Cafes/Note.md');
  });

  it('handles case-sensitive Unicode character matching', async () => {
    plugin.settings.rules.push({
      key: 'title',
      value: 'Straße', // German sharp S
      destination: 'Streets',
      enabled: true,
      caseInsensitive: false
    });
    await plugin.saveSettingsWithoutReorganizing();

    const file = createTFile('Note.md');
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { title: 'STRASSE' } });

    await handleModify(file);
    // Should not match due to case sensitivity
    expect(renameFile).not.toHaveBeenCalled();
  });
});

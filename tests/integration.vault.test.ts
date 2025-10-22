/**
 * Integration tests with realistic Obsidian vault scenarios.
 * These tests simulate real-world usage patterns with actual vault structures,
 * multiple files, and complex rule interactions.
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

const createTFile = (path: string): TFile => new (TFile as unknown as { new(path: string): TFile })(path);

describe('Integration Tests - Realistic Vault Scenarios', () => {
  let metadataCache: { getFileCache: jest.Mock; on: jest.Mock };
  let renameFile: jest.Mock;
  let createFolder: jest.Mock;
  let getAbstractFileByPath: jest.Mock;
  let existingFolders: Set<string>;
  let plugin: VaultOrganizer;
  let handleModify: (file: any) => Promise<void>;
  let registeredCommands: any[];
  let addCommandMock: jest.Mock;
  let metadataChangedHandler: ((file: any) => Promise<void> | void) | undefined;

  const addRule = async (rule: any) => {
    plugin.settings.rules.push({ enabled: true, ...rule });
    plugin.updateRulesFromSettings();
  };

  const clearRules = async () => {
    plugin.settings.rules.splice(0, plugin.settings.rules.length);
    plugin.updateRulesFromSettings();
  };

  beforeEach(async () => {
    metadataChangedHandler = undefined;
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
    registeredCommands = [];
    addCommandMock = jest.fn((command) => { registeredCommands.push(command); return command; });
    (plugin as any).addCommand = addCommandMock;
    await plugin.onload();
    expect(handleModify).toBeDefined();
    (Notice as jest.Mock).mockClear();
    renameFile.mockClear();
  });

  describe('Scenario 1: Daily Note Organization', () => {
    it('organizes daily notes by year and month based on date frontmatter', async () => {
      await addRule({ key: 'date', matchType: 'regex', value: '^2024-01-', destination: 'Daily Notes/2024/January', isRegex: true, flags: '' });
      await addRule({ key: 'date', matchType: 'regex', value: '^2024-02-', destination: 'Daily Notes/2024/February', isRegex: true, flags: '' });

      const dailyNote1 = createTFile('2024-01-15.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { date: '2024-01-15' } });
      await handleModify(dailyNote1);
      expect(renameFile).toHaveBeenCalledWith(dailyNote1, 'Daily Notes/2024/January/2024-01-15.md');
      renameFile.mockClear();

      const dailyNote2 = createTFile('2024-02-20.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { date: '2024-02-20' } });
      await handleModify(dailyNote2);
      expect(renameFile).toHaveBeenCalledWith(dailyNote2, 'Daily Notes/2024/February/2024-02-20.md');
    });

    it('handles daily notes with multiple tags', async () => {
      await addRule({ key: 'tags', value: 'journal', destination: 'Journal' });
      await addRule({ key: 'tags', value: 'work', destination: 'Work' });

      const dailyNote = createTFile('Daily/2024-01-15.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['journal', 'daily', 'reflection'] }
      });

      await handleModify(dailyNote);
      // First matching rule wins
      expect(renameFile).toHaveBeenCalledWith(dailyNote, 'Journal/2024-01-15.md');
    });
  });

  describe('Scenario 2: Project Management System', () => {
    it('organizes project notes by status and priority', async () => {
      await addRule({ key: 'status', value: 'active', destination: 'Projects/Active' });
      await addRule({ key: 'status', value: 'archived', destination: 'Projects/Archive' });
      await addRule({ key: 'priority', value: 'high', destination: 'Projects/High Priority' });

      const activeProject = createTFile('Project Alpha.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { status: 'active', priority: 'medium' }
      });
      await handleModify(activeProject);
      expect(renameFile).toHaveBeenCalledWith(activeProject, 'Projects/Active/Project Alpha.md');
      renameFile.mockClear();

      const highPriorityProject = createTFile('Critical Task.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { status: 'pending', priority: 'high' }
      });
      await handleModify(highPriorityProject);
      expect(renameFile).toHaveBeenCalledWith(highPriorityProject, 'Projects/High Priority/Critical Task.md');
    });

    it('handles nested project folders', async () => {
      await addRule({
        key: 'project',
        value: 'client-a',
        destination: 'Clients/Client A/Projects'
      });

      const projectNote = createTFile('Feature Implementation.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { project: 'client-a' } });

      await handleModify(projectNote);
      expect(createFolder).toHaveBeenCalledWith('Clients');
      expect(createFolder).toHaveBeenCalledWith('Clients/Client A');
      expect(createFolder).toHaveBeenCalledWith('Clients/Client A/Projects');
      expect(renameFile).toHaveBeenCalledWith(projectNote, 'Clients/Client A/Projects/Feature Implementation.md');
    });
  });

  describe('Scenario 3: Academic Research Vault', () => {
    it('organizes literature notes by subject and year', async () => {
      await addRule({ key: 'subject', value: 'physics', destination: 'Research/Physics' });
      await addRule({ key: 'subject', value: 'mathematics', destination: 'Research/Mathematics' });
      await addRule({ key: 'type', value: 'literature', destination: 'Research/Literature' });

      const physicsNote = createTFile('Quantum Mechanics Paper.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { subject: 'physics', year: 2024, type: 'literature' }
      });
      await handleModify(physicsNote);
      // First matching rule (subject: physics) wins
      expect(renameFile).toHaveBeenCalledWith(physicsNote, 'Research/Physics/Quantum Mechanics Paper.md');
      renameFile.mockClear();
    });

    it('handles citation keys and bibliographic data', async () => {
      await addRule({ key: 'citation-key', matchType: 'starts-with', value: 'einstein', destination: 'Authors/Einstein', enabled: true });

      const paper = createTFile('Relativity.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { 'citation-key': 'einstein1905relativity' }
      });

      await handleModify(paper);
      expect(renameFile).toHaveBeenCalledWith(paper, 'Authors/Einstein/Relativity.md');
    });
  });

  describe('Scenario 4: Content Creation Workflow', () => {
    it('moves drafts to appropriate folders when published', async () => {
      await addRule({ key: 'status', value: 'draft', destination: 'Drafts' });
      await addRule({ key: 'status', value: 'published', destination: 'Published/Blog' });
      await addRule({ key: 'category', value: 'tutorial', destination: 'Published/Tutorials' });

      const draftPost = createTFile('My Blog Post.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { status: 'draft', category: 'tutorial' }
      });
      await handleModify(draftPost);
      // First matching rule wins
      expect(renameFile).toHaveBeenCalledWith(draftPost, 'Drafts/My Blog Post.md');
      renameFile.mockClear();

      // After publishing, status changes
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { status: 'published', category: 'tutorial' }
      });
      const publishedPost = createTFile('Drafts/My Blog Post.md');
      await handleModify(publishedPost);
      expect(renameFile).toHaveBeenCalledWith(publishedPost, 'Published/Blog/My Blog Post.md');
    });
  });

  describe('Scenario 5: Personal Knowledge Management', () => {
    it('organizes notes by topic and MOC (Map of Content)', async () => {
      await addRule({ key: 'type', value: 'moc', destination: 'MOCs' });
      await addRule({ key: 'topic', value: 'programming', destination: 'Topics/Programming' });
      await addRule({ key: 'topic', value: 'philosophy', destination: 'Topics/Philosophy' });

      const moc = createTFile('Programming MOC.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'moc' } });
      await handleModify(moc);
      expect(renameFile).toHaveBeenCalledWith(moc, 'MOCs/Programming MOC.md');
      renameFile.mockClear();

      const topicNote = createTFile('Design Patterns.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { topic: 'programming' } });
      await handleModify(topicNote);
      expect(renameFile).toHaveBeenCalledWith(topicNote, 'Topics/Programming/Design Patterns.md');
    });

    it('handles Zettelkasten-style linking', async () => {
      await addRule({ key: 'zettel-type', value: 'permanent', destination: 'Zettelkasten/Permanent' });
      await addRule({ key: 'zettel-type', value: 'fleeting', destination: 'Zettelkasten/Fleeting' });
      await addRule({ key: 'zettel-type', value: 'literature', destination: 'Zettelkasten/Literature' });

      const permanentNote = createTFile('20240115120000 Core Concept.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { 'zettel-type': 'permanent' } });
      await handleModify(permanentNote);
      expect(renameFile).toHaveBeenCalledWith(permanentNote, 'Zettelkasten/Permanent/20240115120000 Core Concept.md');
    });
  });

  describe('Scenario 6: Multi-language Vault', () => {
    it('organizes notes by language', async () => {
      await addRule({ key: 'lang', value: 'en', destination: 'English' });
      await addRule({ key: 'lang', value: 'es', destination: 'Español' });
      await addRule({ key: 'lang', value: 'fr', destination: 'Français' });

      const englishNote = createTFile('My Note.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'en' } });
      await handleModify(englishNote);
      expect(renameFile).toHaveBeenCalledWith(englishNote, 'English/My Note.md');
      renameFile.mockClear();

      const spanishNote = createTFile('Mi Nota.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { lang: 'es' } });
      await handleModify(spanishNote);
      expect(renameFile).toHaveBeenCalledWith(spanishNote, 'Español/Mi Nota.md');
    });
  });

  describe('Scenario 7: Meeting Notes Organization', () => {
    it('organizes meeting notes by team and date', async () => {
      await addRule({ key: 'type', value: 'meeting', destination: 'Meetings' });
      await addRule({ key: 'team', value: 'engineering', destination: 'Meetings/Engineering' });
      await addRule({ key: 'team', value: 'product', destination: 'Meetings/Product' });

      const engineeringMeeting = createTFile('2024-01-15 Sprint Planning.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { type: 'meeting', team: 'engineering', date: '2024-01-15' }
      });
      await handleModify(engineeringMeeting);
      // First matching rule (type: meeting) wins
      expect(renameFile).toHaveBeenCalledWith(engineeringMeeting, 'Meetings/2024-01-15 Sprint Planning.md');
    });
  });

  describe('Scenario 8: Book and Media Notes', () => {
    it('organizes book notes by genre and reading status', async () => {
      await addRule({ key: 'type', value: 'book', destination: 'Books' });
      await addRule({ key: 'genre', value: 'fiction', destination: 'Books/Fiction' });
      await addRule({ key: 'genre', value: 'non-fiction', destination: 'Books/Non-Fiction' });
      await addRule({ key: 'status', value: 'reading', destination: 'Currently Reading' });

      const bookNote = createTFile('The Pragmatic Programmer.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { type: 'book', genre: 'non-fiction', status: 'completed' }
      });
      await handleModify(bookNote);
      expect(renameFile).toHaveBeenCalledWith(bookNote, 'Books/The Pragmatic Programmer.md');
      renameFile.mockClear();

      const currentBook = createTFile('New Book.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { type: 'book', genre: 'fiction', status: 'reading' }
      });
      await handleModify(currentBook);
      // First matching rule (type: book) wins
      expect(renameFile).toHaveBeenCalledWith(currentBook, 'Books/New Book.md');
    });
  });

  describe('Complex Rule Interactions', () => {
    it('applies the first matching rule when multiple rules could match', async () => {
      await addRule({ key: 'priority', value: 'high', destination: 'High Priority' });
      await addRule({ key: 'status', value: 'urgent', destination: 'Urgent' });
      await addRule({ key: 'type', value: 'task', destination: 'Tasks' });

      const note = createTFile('Important Task.md');
      metadataCache.getFileCache.mockReturnValue({
        frontmatter: { priority: 'high', status: 'urgent', type: 'task' }
      });

      await handleModify(note);
      // Should match the first rule
      expect(renameFile).toHaveBeenCalledWith(note, 'High Priority/Important Task.md');
    });

    it('respects rule order when reorganizing entire vault', async () => {
      await addRule({ key: 'category', value: 'important', destination: 'Important' });
      await addRule({ key: 'category', value: 'archive', destination: 'Archive' });

      const file1 = createTFile('Note1.md');
      const file2 = createTFile('Note2.md');

      (plugin.app.vault.getMarkdownFiles as jest.Mock).mockReturnValue([file1, file2]);

      // Mock needs to return values for each call during the reorganization
      metadataCache.getFileCache.mockImplementation((file: any) => {
        if (file.path === 'Note1.md') {
          return { frontmatter: { category: 'important' } };
        }
        if (file.path === 'Note2.md') {
          return { frontmatter: { category: 'archive' } };
        }
        return undefined;
      });

      const applyRulesCommand = registeredCommands.find(cmd => cmd.id === 'obsidian-vault-organizer-apply-rules');
      await applyRulesCommand.callback();

      expect(renameFile).toHaveBeenCalledWith(file1, 'Important/Note1.md');
      expect(renameFile).toHaveBeenCalledWith(file2, 'Archive/Note2.md');
    });

    it('handles disabled rules correctly in rule chain', async () => {
      await addRule({ key: 'tag', value: 'project', destination: 'Projects', enabled: false });
      await addRule({ key: 'tag', value: 'project', destination: 'Active Projects', enabled: true });

      const note = createTFile('My Project.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'project' } });

      await handleModify(note);
      // Should skip disabled rule and use the enabled one
      expect(renameFile).toHaveBeenCalledWith(note, 'Active Projects/My Project.md');
    });
  });

  describe('Edge Cases in Real Vaults', () => {
    it('handles files that are already in the destination folder', async () => {
      await addRule({ key: 'type', value: 'note', destination: 'Notes' });

      const note = createTFile('Notes/My Note.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { type: 'note' } });

      await handleModify(note);
      // Should not try to rename if already in correct location
      expect(renameFile).not.toHaveBeenCalled();
    });

    it('handles files without frontmatter gracefully', async () => {
      await addRule({ key: 'type', value: 'note', destination: 'Notes' });

      const note = createTFile('No Frontmatter.md');
      metadataCache.getFileCache.mockReturnValue(undefined);

      await handleModify(note);
      expect(renameFile).not.toHaveBeenCalled();
    });

    it('handles empty frontmatter values', async () => {
      await addRule({ key: 'category', value: 'test', destination: 'Categorized' });

      const note = createTFile('Empty Category.md');
      metadataCache.getFileCache.mockReturnValue({ frontmatter: { category: '' } });

      await handleModify(note);
      // Empty string in frontmatter should not match non-empty rule value
      expect(renameFile).not.toHaveBeenCalled();
    });
  });
});

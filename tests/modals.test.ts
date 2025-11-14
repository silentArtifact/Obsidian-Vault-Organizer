/**
 * @jest-environment jsdom
 */

jest.mock('obsidian', () => {
  class Plugin {
    app: any;
    manifest: any;
    settings: any = { moveHistory: [], maxHistorySize: 50 };
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
    loadData() { return Promise.resolve(undefined); }
    saveData(_data: any) { return Promise.resolve(); }
    saveSettings() { return Promise.resolve(); }
    addSettingTab(_tab: any) {}
    registerEvent() {}
    addCommand() {}
  }

  class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(_app: any, _plugin: any) {
      this.containerEl = document.createElement('div');
    }
  }

  class Setting {
    settingEl: HTMLDivElement;
    constructor(containerEl: HTMLElement) {
      this.settingEl = document.createElement('div');
      containerEl.appendChild(this.settingEl);
    }
    setName(_name: string) { return this; }
    setDesc(_desc: string) { return this; }
    addText(_cb: any) { return this; }
    addToggle(_cb: any) { return this; }
    addDropdown(_cb: any) { return this; }
    addButton(_cb: any) { return this; }
    addExtraButton(_cb: any) { return this; }
  }

  const debounce = <T extends (...args: any[]) => any>(fn: T) => {
    return fn as any;
  };

  const enhanceElement = (el: HTMLElement): any => {
    (el as any).createEl = (tag: string, opts?: any) => {
      const elem = document.createElement(tag);
      if (opts?.text) elem.textContent = opts.text;
      if (opts?.cls) elem.classList.add(opts.cls);
      el.appendChild(elem);
      enhanceElement(elem);
      return elem;
    };
    (el as any).createSpan = (opts?: any) => {
      const span = document.createElement('span');
      if (opts?.text) span.textContent = opts.text;
      if (opts?.cls) span.classList.add(opts.cls);
      el.appendChild(span);
      enhanceElement(span);
      return span;
    };
    (el as any).createDiv = (opts?: any) => {
      const div = document.createElement('div');
      if (opts?.cls) div.classList.add(opts.cls);
      el.appendChild(div);
      enhanceElement(div);
      return div;
    };
    return el;
  };

  class Modal {
    app: any;
    contentEl: HTMLElement;
    constructor(app: any) {
      this.app = app;
      this.contentEl = document.createElement('div');
      (this.contentEl as any).empty = () => { this.contentEl.innerHTML = ''; };
      enhanceElement(this.contentEl);
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
  }

  const Notice = jest.fn().mockImplementation(function (this: any, message: string) {
    this.message = message;
  });

  class TFile {
    path: string;
    basename: string;
    name: string;
    extension: string;
    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() || '';
      this.basename = this.name.replace(/\.[^.]+$/, '');
      this.extension = 'md';
    }
  }

  class FuzzySuggestModal<T> {
    app: any;
    constructor(app: any) {
      this.app = app;
    }
    open() {}
    getItems(): T[] { return [] as T[]; }
    getItemText(item: T): string { return String(item); }
    onChooseItem(_item: T) {}
  }

  const getAllTags = jest.fn(() => ({}));

  return {
    Plugin,
    Modal,
    Notice,
    TFile,
    FuzzySuggestModal,
    PluginSettingTab,
    Setting,
    debounce,
    getAllTags
  };
}, { virtual: true });

import { MoveHistoryModal, TestAllRulesModal, RuleTagPickerModal, RuleFrontmatterKeyPickerModal } from '../src/ui/modals';
import VaultOrganizer from '../main';
import type { MoveHistoryEntry, RuleTestResult } from '../src/types';

const { Notice, TFile } = jest.requireMock('obsidian');

describe('MoveHistoryModal', () => {
  let plugin: VaultOrganizer;
  let modal: MoveHistoryModal;
  let app: any;

  beforeEach(() => {
    app = {
      metadataCache: { on: jest.fn() },
      fileManager: {},
      vault: { on: jest.fn(), getName: jest.fn(() => 'TestVault') },
    };
    const manifest = {
      id: 'vault-organizer',
      name: 'Vault Organizer',
      version: '1.0.0',
    } as any;
    plugin = new VaultOrganizer(app, manifest);
    plugin.saveSettings = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('displays "No move history yet" when history is empty', () => {
    plugin.settings = {
      rules: [],
      moveHistory: [],
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Move History');
    expect(modal.contentEl.textContent).toContain('No move history yet.');
  });

  it('displays move history entries in chronological order', () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: 1000000,
        fileName: 'note1.md',
        fromPath: 'Inbox/note1.md',
        toPath: 'Projects/note1.md',
        ruleKey: 'status',
      },
      {
        timestamp: 900000,
        fileName: 'note2.md',
        fromPath: 'Drafts/note2.md',
        toPath: 'Archive/note2.md',
        ruleKey: 'type',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('note1.md');
    expect(modal.contentEl.textContent).toContain('Inbox/note1.md');
    expect(modal.contentEl.textContent).toContain('Projects/note1.md');
    expect(modal.contentEl.textContent).toContain('status');
    expect(modal.contentEl.textContent).toContain('note2.md');
    expect(modal.contentEl.textContent).toContain('Drafts/note2.md');
    expect(modal.contentEl.textContent).toContain('Archive/note2.md');
    expect(modal.contentEl.textContent).toContain('type');
  });

  it('highlights the most recent move', () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: Date.now(),
        fileName: 'recent.md',
        fromPath: 'Old/recent.md',
        toPath: 'New/recent.md',
        ruleKey: 'status',
      },
      {
        timestamp: Date.now() - 100000,
        fileName: 'older.md',
        fromPath: 'Old/older.md',
        toPath: 'New/older.md',
        ruleKey: 'type',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Most Recent');
    expect(modal.contentEl.textContent).toContain('recent.md');
  });

  it('displays undo button only for the most recent move', () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: Date.now(),
        fileName: 'recent.md',
        fromPath: 'Old/recent.md',
        toPath: 'New/recent.md',
        ruleKey: 'status',
      },
      {
        timestamp: Date.now() - 100000,
        fileName: 'older.md',
        fromPath: 'Old/older.md',
        toPath: 'New/older.md',
        ruleKey: 'type',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    const undoButtons = modal.contentEl.querySelectorAll('button');
    // Should have 1 undo button + 1 clear button + 1 close button = 3 total
    const undoButton = Array.from(undoButtons).find(btn => btn.textContent === 'Undo This Move');
    expect(undoButton).toBeDefined();

    // Count how many undo buttons exist (should be exactly 1)
    const undoButtonCount = Array.from(undoButtons).filter(btn => btn.textContent === 'Undo This Move').length;
    expect(undoButtonCount).toBe(1);
  });

  it('calls undoLastMove when undo button is clicked', async () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: Date.now(),
        fileName: 'recent.md',
        fromPath: 'Old/recent.md',
        toPath: 'New/recent.md',
        ruleKey: 'status',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    plugin.undoLastMove = jest.fn().mockResolvedValue(undefined);
    modal = new MoveHistoryModal(app, plugin);
    modal.close = jest.fn();
    modal.onOpen();

    const buttons = modal.contentEl.querySelectorAll('button');
    const undoButton = Array.from(buttons).find(btn => btn.textContent === 'Undo This Move') as HTMLButtonElement;
    expect(undoButton).toBeDefined();

    undoButton.click();
    await Promise.resolve();

    expect(modal.close).toHaveBeenCalled();
    expect(plugin.undoLastMove).toHaveBeenCalled();
  });

  it('clears history when Clear History button is clicked', async () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: Date.now(),
        fileName: 'note.md',
        fromPath: 'Old/note.md',
        toPath: 'New/note.md',
        ruleKey: 'status',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.close = jest.fn();
    modal.onOpen();

    const buttons = modal.contentEl.querySelectorAll('button');
    const clearButton = Array.from(buttons).find(btn => btn.textContent === 'Clear History') as HTMLButtonElement;
    expect(clearButton).toBeDefined();

    clearButton.click();
    await Promise.resolve();

    expect(plugin.settings.moveHistory).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('Move history cleared.');
    expect(modal.close).toHaveBeenCalled();
  });

  it('closes modal when Close button is clicked', () => {
    plugin.settings = {
      rules: [],
      moveHistory: [],
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.close = jest.fn();
    modal.onOpen();

    const buttons = modal.contentEl.querySelectorAll('button');
    const closeButton = Array.from(buttons).find(btn => btn.textContent === 'Close') as HTMLButtonElement;
    expect(closeButton).toBeDefined();

    closeButton.click();

    expect(modal.close).toHaveBeenCalled();
  });

  it('clears content when modal is closed', () => {
    plugin.settings = {
      rules: [],
      moveHistory: [],
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    const initialContent = modal.contentEl.innerHTML;
    expect(initialContent).not.toBe('');

    modal.onClose();
    expect(modal.contentEl.innerHTML).toBe('');
  });

  it('displays formatted timestamps for move history entries', () => {
    const testDate = new Date('2025-01-15T10:30:00.000Z');
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: testDate.getTime(),
        fileName: 'note.md',
        fromPath: 'Old/note.md',
        toPath: 'New/note.md',
        ruleKey: 'status',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    // The modal should contain a formatted time string
    expect(modal.contentEl.textContent).toContain('⏰');
  });

  it('displays history count information', () => {
    const entries: MoveHistoryEntry[] = [
      {
        timestamp: Date.now(),
        fileName: 'note1.md',
        fromPath: 'Old/note1.md',
        toPath: 'New/note1.md',
        ruleKey: 'status',
      },
      {
        timestamp: Date.now() - 100000,
        fileName: 'note2.md',
        fromPath: 'Old/note2.md',
        toPath: 'New/note2.md',
        ruleKey: 'type',
      },
    ];

    plugin.settings = {
      rules: [],
      moveHistory: entries,
      maxHistorySize: 50,
    };

    modal = new MoveHistoryModal(app, plugin);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Showing 2 of last 50 moves');
  });
});

describe('TestAllRulesModal', () => {
  let modal: TestAllRulesModal;
  let app: any;

  beforeEach(() => {
    app = {
      metadataCache: { on: jest.fn() },
      fileManager: {},
      vault: { on: jest.fn() },
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('displays message when no files would be moved', () => {
    const results: RuleTestResult[] = [];
    const rules = [];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Test All Rules - Preview');
    expect(modal.contentEl.textContent).toContain('No files would be moved');
    expect(modal.contentEl.textContent).toContain('already in the correct location');
  });

  it('displays files that would be moved', () => {
    const file = new TFile('Inbox/note.md');
    const results: RuleTestResult[] = [
      {
        file,
        currentPath: 'Inbox/note.md',
        newPath: 'Projects/note.md',
        ruleIndex: 0,
      },
    ];
    const rules = [{ key: 'status', value: 'active', destination: 'Projects', matchType: 'equals', enabled: true }];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('1 file(s) would be moved');
    expect(modal.contentEl.textContent).toContain('note');
    expect(modal.contentEl.textContent).toContain('Inbox/note.md');
    expect(modal.contentEl.textContent).toContain('Projects/note.md');
    expect(modal.contentEl.textContent).toContain('Rule 1 (status)');
  });

  it('displays multiple files that would be moved', () => {
    const file1 = new TFile('Inbox/note1.md');
    const file2 = new TFile('Drafts/note2.md');
    const results: RuleTestResult[] = [
      {
        file: file1,
        currentPath: 'Inbox/note1.md',
        newPath: 'Projects/note1.md',
        ruleIndex: 0,
      },
      {
        file: file2,
        currentPath: 'Drafts/note2.md',
        newPath: 'Archive/note2.md',
        ruleIndex: 1,
      },
    ];
    const rules = [
      { key: 'status', value: 'active', destination: 'Projects', matchType: 'equals', enabled: true },
      { key: 'type', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true },
    ];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('2 file(s) would be moved');
    expect(modal.contentEl.textContent).toContain('note1');
    expect(modal.contentEl.textContent).toContain('note2');
    expect(modal.contentEl.textContent).toContain('Projects/note1.md');
    expect(modal.contentEl.textContent).toContain('Archive/note2.md');
  });

  it('displays warnings for files with path warnings', () => {
    const file = new TFile('Inbox/note.md');
    const results: RuleTestResult[] = [
      {
        file,
        currentPath: 'Inbox/note.md',
        newPath: 'Projects/note.md',
        ruleIndex: 0,
        warnings: ['Path contains leading slashes', 'Path normalized'],
      },
    ];
    const rules = [{ key: 'status', value: 'active', destination: 'Projects', matchType: 'equals', enabled: true }];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Warnings:');
    expect(modal.contentEl.textContent).toContain('Path contains leading slashes; Path normalized');
  });

  it('displays skipped files section when there are invalid destinations', () => {
    const file = new TFile('Inbox/note.md');
    const mockError = {
      getUserMessage: () => 'Invalid destination path',
    };
    const results: RuleTestResult[] = [
      {
        file,
        currentPath: 'Inbox/note.md',
        ruleIndex: 0,
        error: mockError as any,
      },
    ];
    const rules = [{ key: 'status', value: 'active', destination: '../invalid', matchType: 'equals', enabled: true }];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Skipped due to invalid destinations');
    expect(modal.contentEl.textContent).toContain('note');
    expect(modal.contentEl.textContent).toContain('Inbox/note.md');
    expect(modal.contentEl.textContent).toContain('Reason:');
    expect(modal.contentEl.textContent).toContain('Invalid destination path');
  });

  it('handles mixed valid and invalid results', () => {
    const file1 = new TFile('Inbox/valid.md');
    const file2 = new TFile('Inbox/invalid.md');
    const mockError = {
      getUserMessage: () => 'Path validation failed',
    };
    const results: RuleTestResult[] = [
      {
        file: file1,
        currentPath: 'Inbox/valid.md',
        newPath: 'Projects/valid.md',
        ruleIndex: 0,
      },
      {
        file: file2,
        currentPath: 'Inbox/invalid.md',
        ruleIndex: 1,
        error: mockError as any,
      },
    ];
    const rules = [
      { key: 'status', value: 'active', destination: 'Projects', matchType: 'equals', enabled: true },
      { key: 'type', value: 'bad', destination: '///invalid', matchType: 'equals', enabled: true },
    ];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('1 file(s) would be moved');
    expect(modal.contentEl.textContent).toContain('valid');
    expect(modal.contentEl.textContent).toContain('Skipped due to invalid destinations');
    expect(modal.contentEl.textContent).toContain('invalid');
  });

  it('closes modal when Close button is clicked', () => {
    const results: RuleTestResult[] = [];
    const rules: any[] = [];

    modal = new TestAllRulesModal(app, results, rules);
    modal.close = jest.fn();
    modal.onOpen();

    const buttons = modal.contentEl.querySelectorAll('button');
    const closeButton = Array.from(buttons).find(btn => btn.textContent === 'Close') as HTMLButtonElement;
    expect(closeButton).toBeDefined();

    closeButton.click();

    expect(modal.close).toHaveBeenCalled();
  });

  it('clears content when modal is closed', () => {
    const results: RuleTestResult[] = [];
    const rules: any[] = [];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    const initialContent = modal.contentEl.innerHTML;
    expect(initialContent).not.toBe('');

    modal.onClose();
    expect(modal.contentEl.innerHTML).toBe('');
  });

  it('displays message when all files are already in correct location', () => {
    const results: RuleTestResult[] = [];
    const rules = [{ key: 'status', value: 'active', destination: 'Projects', matchType: 'equals', enabled: true }];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('No files would be moved');
  });

  it('handles results with warnings in skipped section', () => {
    const file = new TFile('Inbox/note.md');
    const mockError = {
      getUserMessage: () => 'Invalid path',
    };
    const results: RuleTestResult[] = [
      {
        file,
        currentPath: 'Inbox/note.md',
        ruleIndex: 0,
        error: mockError as any,
        warnings: ['Warning 1', 'Warning 2'],
      },
    ];
    const rules = [{ key: 'status', value: 'active', destination: '../bad', matchType: 'equals', enabled: true }];

    modal = new TestAllRulesModal(app, results, rules);
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('Warnings:');
    expect(modal.contentEl.textContent).toContain('Warning 1; Warning 2');
  });
});

describe('RuleTagPickerModal', () => {
  let app: any;
  let modal: RuleTagPickerModal;
  let onSelectCallback: jest.Mock;

  beforeEach(() => {
    app = {
      metadataCache: { on: jest.fn() },
      fileManager: {},
      vault: { on: jest.fn() },
    };
    onSelectCallback = jest.fn();
  });

  it('returns the provided tags from getItems', () => {
    const tags = ['#tag1', '#tag2', '#tag3'];
    modal = new RuleTagPickerModal(app, tags, onSelectCallback);

    const items = modal.getItems();

    expect(items).toEqual(tags);
  });

  it('returns tag text from getItemText', () => {
    const tags = ['#myTag'];
    modal = new RuleTagPickerModal(app, tags, onSelectCallback);

    const text = modal.getItemText('#myTag');

    expect(text).toBe('#myTag');
  });

  it('calls onSelect callback when item is chosen', () => {
    const tags = ['#selected'];
    modal = new RuleTagPickerModal(app, tags, onSelectCallback);

    modal.onChooseItem('#selected');

    expect(onSelectCallback).toHaveBeenCalledWith('#selected');
  });

  it('handles empty tags array', () => {
    modal = new RuleTagPickerModal(app, [], onSelectCallback);

    const items = modal.getItems();

    expect(items).toEqual([]);
  });

  it('handles multiple tag selections', () => {
    const tags = ['#tag1', '#tag2'];
    modal = new RuleTagPickerModal(app, tags, onSelectCallback);

    modal.onChooseItem('#tag1');
    modal.onChooseItem('#tag2');

    expect(onSelectCallback).toHaveBeenCalledTimes(2);
    expect(onSelectCallback).toHaveBeenNthCalledWith(1, '#tag1');
    expect(onSelectCallback).toHaveBeenNthCalledWith(2, '#tag2');
  });
});

describe('RuleFrontmatterKeyPickerModal', () => {
  let app: any;
  let modal: RuleFrontmatterKeyPickerModal;
  let onSelectCallback: jest.Mock;

  beforeEach(() => {
    app = {
      metadataCache: { on: jest.fn() },
      fileManager: {},
      vault: { on: jest.fn() },
    };
    onSelectCallback = jest.fn();
  });

  it('returns the provided keys from getItems', () => {
    const keys = ['status', 'category', 'priority'];
    modal = new RuleFrontmatterKeyPickerModal(app, keys, onSelectCallback);

    const items = modal.getItems();

    expect(items).toEqual(keys);
  });

  it('returns key text from getItemText', () => {
    const keys = ['myKey'];
    modal = new RuleFrontmatterKeyPickerModal(app, keys, onSelectCallback);

    const text = modal.getItemText('myKey');

    expect(text).toBe('myKey');
  });

  it('calls onSelect callback when item is chosen', () => {
    const keys = ['selectedKey'];
    modal = new RuleFrontmatterKeyPickerModal(app, keys, onSelectCallback);

    modal.onChooseItem('selectedKey');

    expect(onSelectCallback).toHaveBeenCalledWith('selectedKey');
  });

  it('handles empty keys array', () => {
    modal = new RuleFrontmatterKeyPickerModal(app, [], onSelectCallback);

    const items = modal.getItems();

    expect(items).toEqual([]);
  });

  it('handles multiple key selections', () => {
    const keys = ['key1', 'key2', 'key3'];
    modal = new RuleFrontmatterKeyPickerModal(app, keys, onSelectCallback);

    modal.onChooseItem('key1');
    modal.onChooseItem('key3');

    expect(onSelectCallback).toHaveBeenCalledTimes(2);
    expect(onSelectCallback).toHaveBeenNthCalledWith(1, 'key1');
    expect(onSelectCallback).toHaveBeenNthCalledWith(2, 'key3');
  });
});

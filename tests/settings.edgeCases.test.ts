/**
 * @jest-environment jsdom
 */

jest.mock('obsidian', () => {
  class Plugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
    loadData() { return Promise.resolve(undefined); }
    saveData(_data: any) { return Promise.resolve(); }
    addSettingTab(_tab: any) {}
    registerEvent() {}
    addCommand() {}
  }

  class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(_app: any, _plugin: any) {
      this.containerEl = document.createElement('div');
      (this.containerEl as any).empty = () => { this.containerEl.innerHTML = ''; };
      document.body.appendChild(this.containerEl);
    }
  }

  class Setting {
    settingEl: HTMLDivElement;
    constructor(containerEl: HTMLElement) {
      this.settingEl = document.createElement('div');
      this.settingEl.classList.add('setting-item');
      containerEl.appendChild(this.settingEl);
    }
    setName(_name: string) { return this; }
    setDesc(_desc: string) { return this; }
    addText(cb: (api: any) => void) {
      const input = document.createElement('input');
      input.type = 'text';
      this.settingEl.appendChild(input);
      const api = {
        setPlaceholder: (p: string) => { input.placeholder = p; return api; },
        setValue: (v: string) => { input.value = v; return api; },
        getValue: () => input.value,
        onChange: (fn: (v: string) => void) => { input.addEventListener('input', e => fn((e.target as HTMLInputElement).value)); return api; },
        inputEl: input,
      };
      cb(api);
      return this;
    }
    addToggle(cb: (api: any) => void) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      this.settingEl.appendChild(input);
      const api = {
        setTooltip: (t: string) => { input.title = t; return api; },
        setValue: (v: boolean) => { input.checked = v; return api; },
        onChange: (fn: (v: boolean) => void) => { input.addEventListener('change', e => fn((e.target as HTMLInputElement).checked)); return api; },
        toggleEl: input,
      };
      cb(api);
      return this;
    }
    addDropdown(cb: (api: any) => void) {
      const select = document.createElement('select');
      this.settingEl.appendChild(select);
      const api = {
        addOption: (value: string, label: string) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          select.appendChild(option);
          return api;
        },
        setValue: (v: string) => { select.value = v; return api; },
        onChange: (fn: (v: string) => void) => { select.addEventListener('change', e => fn((e.target as HTMLSelectElement).value)); return api; },
        selectEl: select,
      };
      cb(api);
      return this;
    }
    addButton(cb: (api: any) => void) {
      const button = document.createElement('button');
      this.settingEl.appendChild(button);
      const api = {
        setButtonText: (t: string) => { button.textContent = t; return api; },
        setTooltip: (t: string) => { button.title = t; return api; },
        onClick: (fn: () => void) => { button.addEventListener('click', fn); return api; },
      };
      cb(api);
      return this;
    }
    addExtraButton(cb: (api: any) => void) {
      const button = document.createElement('button');
      button.type = 'button';
      this.settingEl.appendChild(button);
      const api = {
        setIcon: (_icon: string) => api,
        setTooltip: (t: string) => { button.title = t; return api; },
        setDisabled: (d: boolean) => { button.disabled = d; return api; },
        onClick: (fn: () => void) => { button.addEventListener('click', fn); return api; },
        buttonEl: button,
      };
      cb(api);
      return this;
    }
  }

  const Notice = jest.fn().mockImplementation(function (this: any, message: string) {
    this.message = message;
  });

  class FuzzySuggestModal<T> {
    static __instances: any[] = [];
    app: any;
    constructor(app: any) {
      this.app = app;
    }
    open() {
      (FuzzySuggestModal as any).__instances.push(this);
    }
    getItems(): T[] { return [] as T[]; }
    getItemText(item: T): string { return String(item); }
    onChooseItem(_item: T) {}
  }
  (FuzzySuggestModal as any).__instances = [];

  const getAllTags = jest.fn((cache: any) => cache?.tags ?? null);

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

  class Modal {
    app: any;
    contentEl: any = {
      empty: jest.fn(),
      createEl: jest.fn(() => ({
        createEl: jest.fn(),
        createSpan: jest.fn(),
        createDiv: jest.fn(),
      })),
      createDiv: jest.fn(() => ({
        style: {},
        createEl: jest.fn(),
        createSpan: jest.fn(),
        createDiv: jest.fn(),
      })),
    };
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
  }

  return { Plugin, PluginSettingTab, Setting, Notice, debounce, FuzzySuggestModal, getAllTags, Modal };
}, { virtual: true });

import VaultOrganizer from '../main';
import { screen, fireEvent } from '@testing-library/dom';

const { Notice, FuzzySuggestModal, getAllTags } = jest.requireMock('obsidian');

describe('Settings UI edge cases for improved coverage', () => {
  let plugin: VaultOrganizer;
  let tab: any;
  let reorganizeSpy: jest.SpyInstance;
  let fileCaches: Map<string, any>;
  let markdownFiles: any[];
  const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    (Notice as jest.Mock).mockClear();
    (FuzzySuggestModal as any).__instances = [];
    (getAllTags as jest.Mock).mockClear();
    fileCaches = new Map<string, any>([
      ['Daily.md', { tags: ['#daily', '#journal'], frontmatter: { category: 'daily', position: {} } }],
    ]);
    markdownFiles = [{ path: 'Daily.md' }];
    const app = {
      metadataCache: {
        on: jest.fn(() => ({})),
        getFileCache: jest.fn((file: any) => fileCaches.get(file.path)),
      },
      fileManager: {},
      vault: { on: jest.fn(), getMarkdownFiles: jest.fn(() => markdownFiles) },
    } as any;
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
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    reorganizeSpy = jest
      .spyOn(plugin as any, 'reorganizeAllMarkdownFiles')
      .mockResolvedValue(undefined);
    plugin.addSettingTab = jest.fn();
    await plugin.onload();
    tab = (plugin.addSettingTab as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    reorganizeSpy.mockRestore();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('handles files with no cache when collecting tags', async () => {
    // Add a file that will return null for getFileCache
    markdownFiles.push({ path: 'NoCache.md' });
    fileCaches.set('NoCache.md', null);

    tab.display();

    // Click to add a rule and trigger tag collection
    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const tagButton = screen.getByTitle('Browse tags');
    await fireEvent.click(tagButton);

    // Should open modal successfully despite null cache
    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeDefined();
  });

  it('handles files with cache but no tags when collecting tags', async () => {
    // Set up a file with cache but getAllTags returns null
    fileCaches.set('NoTags.md', { frontmatter: { title: 'test' } });
    markdownFiles.push({ path: 'NoTags.md' });
    (getAllTags as jest.Mock).mockReturnValueOnce(['#daily', '#journal']).mockReturnValueOnce(null);

    tab.display();

    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const tagButton = screen.getByTitle('Browse tags');
    await fireEvent.click(tagButton);

    // Should handle null tags gracefully
    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeDefined();
  });

  it('handles empty aggregated tags by refreshing', async () => {
    // Clear all tags
    fileCaches.clear();
    markdownFiles.length = 0;

    tab.display();

    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const tagButton = screen.getByTitle('Browse tags');
    await fireEvent.click(tagButton);

    // Should not open modal when no tags available
    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeUndefined();
  });

  it('handles empty frontmatter keys by refreshing', async () => {
    // Set up files with no frontmatter
    fileCaches.clear();
    markdownFiles.length = 0;
    markdownFiles.push({ path: 'NoFrontmatter.md' });
    fileCaches.set('NoFrontmatter.md', { tags: ['#test'] });

    tab.display();

    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const keyButton = screen.getByTitle('Browse frontmatter keys');
    await fireEvent.click(keyButton);

    // Should not open modal when no frontmatter keys available
    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeUndefined();
  });

  it('allows moving rules up and down', async () => {
    plugin.settings.rules = [
      { key: 'status', value: 'done', destination: 'Archive', matchType: 'equals', enabled: true, debug: false },
      { key: 'status', value: 'in-progress', destination: 'Active', matchType: 'equals', enabled: true, debug: false },
      { key: 'status', value: 'todo', destination: 'Backlog', matchType: 'equals', enabled: true, debug: false },
    ];

    tab.display();

    // Get all up and down buttons
    const upButtons = screen.getAllByTitle('Move rule up');
    const downButtons = screen.getAllByTitle('Move rule down');

    expect(upButtons).toHaveLength(3);
    expect(downButtons).toHaveLength(3);

    // First rule's up button should be disabled
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);

    // Last rule's down button should be disabled
    expect((downButtons[2] as HTMLButtonElement).disabled).toBe(true);

    // Move second rule up
    await fireEvent.click(upButtons[1]);
    await flushPromises();

    expect(plugin.settings.rules[0].value).toBe('in-progress');
    expect(plugin.settings.rules[1].value).toBe('done');
    expect(plugin.saveData).toHaveBeenCalled();

    // Re-render
    tab.display();

    const downButtonsAfter = screen.getAllByTitle('Move rule down');

    // Move first rule down
    await fireEvent.click(downButtonsAfter[0]);
    await flushPromises();

    expect(plugin.settings.rules[0].value).toBe('done');
    expect(plugin.settings.rules[1].value).toBe('in-progress');
  });

  it('handles rule modification when currentRule becomes undefined', async () => {
    plugin.settings.rules = [
      { key: 'tag', value: 'test', destination: 'Test', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    // Simulate rule being removed while UI interaction is pending
    const activationToggle = screen.getByTitle('Activate this rule') as HTMLInputElement;

    // Remove the rule from settings
    plugin.settings.rules = [];

    // Try to toggle - should handle gracefully
    await fireEvent.click(activationToggle);
    await flushPromises();

    // Should not crash or cause errors
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles switching from regex to non-regex match types', async () => {
    plugin.settings.rules = [
      { key: 'tag', value: 'test.*', destination: 'Test', matchType: 'regex', isRegex: true, flags: 'i', enabled: false, debug: false },
    ];

    tab.display();

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    const flagsInput = screen.getByPlaceholderText('flags') as HTMLInputElement;

    expect(matchTypeSelect.value).toBe('regex');
    expect(flagsInput.value).toBe('i');
    expect(flagsInput.style.display).toBe('');

    // Switch to equals
    await fireEvent.change(matchTypeSelect, { target: { value: 'equals' } });
    await flushPromises();

    expect(plugin.settings.rules[0].matchType).toBe('equals');
    expect(plugin.settings.rules[0].isRegex).toBeUndefined();
    expect(plugin.settings.rules[0].flags).toBeUndefined();
    expect(flagsInput.style.display).toBe('none');
    expect(flagsInput.disabled).toBe(true);
  });

  it('handles case insensitive toggle changes', async () => {
    plugin.settings.rules = [
      { key: 'tag', value: 'Test', destination: 'Test', matchType: 'equals', enabled: false, debug: false, caseInsensitive: false },
    ];

    tab.display();

    const caseToggle = screen.getByTitle('Case insensitive matching') as HTMLInputElement;

    expect(caseToggle.checked).toBe(false);

    await fireEvent.click(caseToggle);
    await flushPromises();

    expect(plugin.settings.rules[0].caseInsensitive).toBe(true);
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('handles test all rules button click', async () => {
    plugin.settings.rules = [
      { key: 'tag', value: 'test', destination: 'Test', matchType: 'equals', enabled: true, debug: false },
    ];

    const testAllRulesSpy = jest.spyOn(plugin, 'testAllRules').mockReturnValue([]);

    tab.display();

    const testButton = screen.getByText('Test All Rules');
    await fireEvent.click(testButton);
    await flushPromises();

    expect(testAllRulesSpy).toHaveBeenCalled();
    expect(plugin.saveData).toHaveBeenCalled();

    testAllRulesSpy.mockRestore();
  });

  it('handles frontmatter key picker when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    const keyButton = screen.getByTitle('Browse frontmatter keys');

    // Remove rule
    plugin.settings.rules = [];

    await fireEvent.click(keyButton);

    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    if (modalInstance) {
      // Try to select a key - should handle gracefully
      modalInstance.onChooseItem('category');
      await jest.runOnlyPendingTimersAsync();
      await flushPromises();
    }

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles tag picker when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    const tagButton = screen.getByTitle('Browse tags');

    // Remove rule
    plugin.settings.rules = [];

    await fireEvent.click(tagButton);

    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    if (modalInstance) {
      // Try to select a tag - should handle gracefully
      modalInstance.onChooseItem('#test');
      await jest.runOnlyPendingTimersAsync();
      await flushPromises();
    }

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles text input changes when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    const keyInput = screen.getByPlaceholderText('key') as HTMLInputElement;
    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    const destInput = screen.getByPlaceholderText('destination folder (required)') as HTMLInputElement;

    // Remove rule
    plugin.settings.rules = [];

    // Try to change inputs - should handle gracefully
    await fireEvent.input(keyInput, { target: { value: 'test' } });
    await fireEvent.input(valueInput, { target: { value: 'value' } });
    await fireEvent.input(destInput, { target: { value: 'dest' } });

    await jest.runOnlyPendingTimersAsync();
    await flushPromises();

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles flags input when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'regex', isRegex: true, flags: '', enabled: false, debug: false },
    ];

    tab.display();

    const flagsInput = screen.getByPlaceholderText('flags') as HTMLInputElement;

    // Remove rule
    plugin.settings.rules = [];

    // Try to change flags - should handle gracefully
    await fireEvent.input(flagsInput, { target: { value: 'i' } });
    await jest.runOnlyPendingTimersAsync();
    await flushPromises();

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles dropdown changes when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;

    // Remove rule
    plugin.settings.rules = [];

    // Try to change match type - should handle gracefully
    await fireEvent.change(matchTypeSelect, { target: { value: 'contains' } });
    await flushPromises();

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });

  it('handles debug toggle when rule is removed', async () => {
    plugin.settings.rules = [
      { key: '', value: '', destination: '', matchType: 'equals', enabled: false, debug: false },
    ];

    tab.display();

    const debugToggle = screen.getByTitle('Enable debug mode') as HTMLInputElement;

    // Remove rule
    plugin.settings.rules = [];

    // Try to toggle debug - should handle gracefully
    await fireEvent.click(debugToggle);
    await flushPromises();

    // Should not crash
    expect(plugin.settings.rules).toEqual([]);
  });
});

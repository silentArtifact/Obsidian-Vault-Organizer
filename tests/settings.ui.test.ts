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
    setName(name: string) {
      const nameEl = document.createElement('div');
      nameEl.classList.add('setting-item-name');
      nameEl.textContent = name;
      this.settingEl.insertBefore(nameEl, this.settingEl.firstChild);
      return this;
    }
    setDesc(_desc: string) { return this; }
    setClass(className: string) { this.settingEl.classList.add(className); return this; }
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

import { TEST_MANIFEST } from './testUtils';
import VaultOrganizer from '../main';
import { screen, fireEvent } from '@testing-library/dom';

const { Notice, FuzzySuggestModal, getAllTags } = jest.requireMock('obsidian');

describe('settings UI', () => {
  let plugin: VaultOrganizer;
  let tab: any;
  let reorganizeSpy: jest.SpyInstance;
  let metadataResolvedCallback: (() => void) | undefined;
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
    metadataResolvedCallback = undefined;
    fileCaches = new Map<string, any>([
      ['Daily.md', { tags: ['#daily', '#journal'], frontmatter: { category: 'daily', position: {} } }],
      ['Todos.md', { tags: ['#todo'], frontmatter: { status: 'open' } }],
    ]);
    markdownFiles = [{ path: 'Daily.md' }, { path: 'Todos.md' }];
    const app = {
      metadataCache: {
        on: jest.fn((event: string, cb: any) => {
          if (event === 'resolved') {
            metadataResolvedCallback = cb;
          }
          return {};
        }),
        getFileCache: jest.fn((file: any) => fileCaches.get(file.path)),
      },
      fileManager: {},
      vault: { on: jest.fn(), getMarkdownFiles: jest.fn(() => markdownFiles) },
    } as any;
    plugin = new VaultOrganizer(app, TEST_MANIFEST as any);
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    reorganizeSpy = jest
      .spyOn(plugin as any, 'reorganizeAllMarkdownFiles')
      .mockResolvedValue(undefined);
    plugin.addSettingTab = jest.fn();
    await plugin.onload();
    tab = (plugin.addSettingTab as jest.Mock).mock.calls[0][0];
    tab.display();
  });

  afterEach(() => {
    reorganizeSpy.mockRestore();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('persists updated rules on UI interactions', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: '', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: '', matchType: 'equals', value: '', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'tag' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: '', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: 'journal' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: 'journal', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const destInput = await screen.findByPlaceholderText('destination folder (supports {variables})') as HTMLInputElement;
    await fireEvent.input(destInput, { target: { value: 'Journal' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const flagsInput = await screen.findByPlaceholderText('flags') as HTMLInputElement;
    expect(flagsInput.style.display).toBe('none');
    expect(flagsInput.disabled).toBe(true);

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'regex' } });
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(5);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: '', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: false, enabled: false }]);
    expect(((plugin as any).rules[0].value as RegExp).source).toBe('journal');
    expect(((plugin as any).rules[0].value as RegExp).flags).toBe('');
    expect(reorganizeSpy).toHaveBeenCalledTimes(1);
    expect(matchTypeSelect.value).toBe('regex');
    expect(flagsInput.style.display).toBe('');
    expect(flagsInput.disabled).toBe(false);

    await fireEvent.input(flagsInput, { target: { value: 'i' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(6);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: false, enabled: false }]);
    expect(((plugin as any).rules[0].value as RegExp).flags).toBe('i');
    expect(reorganizeSpy).toHaveBeenCalledTimes(1);

    const activationToggle = (await screen.findByTitle('Activate this rule')) as HTMLInputElement;
    expect(activationToggle.checked).toBe(false);
    await fireEvent.click(activationToggle);
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(7);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: false, enabled: true }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: false, enabled: true }]);
    expect(reorganizeSpy).toHaveBeenCalledTimes(2);

    const debugToggle = (await screen.findByTitle('Enable debug mode')) as HTMLInputElement;
    await fireEvent.click(debugToggle);
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(8);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: true, enabled: true }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: true, enabled: true }]);
    expect(reorganizeSpy).toHaveBeenCalledTimes(3);

    await fireEvent.click(screen.getByText('Remove'));
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(9);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
    expect((plugin as any).rules).toEqual([]);
    expect(reorganizeSpy).toHaveBeenCalledTimes(3);
    expect((Notice as jest.Mock)).not.toHaveBeenCalled();
  });

  it('allows selecting tags from the picker to populate the value field', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await Promise.resolve();

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    const tagButton = screen.getByTitle('Browse tags');
    await fireEvent.click(tagButton);

    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeDefined();
    modalInstance.onChooseItem('#daily');

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(valueInput.value).toBe('#daily');
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '#daily', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: '', value: '#daily', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));

    fileCaches.set('Ideas.md', { tags: ['#ideas'] });
    markdownFiles.push({ path: 'Ideas.md' });
    metadataResolvedCallback?.();

    await fireEvent.click(tagButton);
    const secondModal = (FuzzySuggestModal as any).__instances.pop();
    expect(secondModal).toBeDefined();
    secondModal.onChooseItem('#ideas');
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(valueInput.value).toBe('#daily #ideas');
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '#daily #ideas', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: '', value: '#daily #ideas', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));

    await fireEvent.click(tagButton);
    const thirdModal = (FuzzySuggestModal as any).__instances.pop();
    expect(thirdModal).toBeDefined();
    thirdModal.onChooseItem('#daily');
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(valueInput.value).toBe('#ideas');
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '#ideas', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: '', value: '#ideas', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
  });

  it('allows selecting frontmatter keys to populate the key field', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await Promise.resolve();

    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    const keyButton = screen.getByTitle('Browse frontmatter keys');
    await fireEvent.click(keyButton);

    const modalInstance = (FuzzySuggestModal as any).__instances.pop();
    expect(modalInstance).toBeDefined();
    modalInstance.onChooseItem('category');

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(keyInput.value).toBe('category');
    expect(plugin.settings.rules[0]).toEqual({ key: 'category', value: '', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'category', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));

    fileCaches.set('Ideas.md', { tags: ['#ideas'], frontmatter: { topic: 'ideas' } });
    markdownFiles.push({ path: 'Ideas.md' });
    metadataResolvedCallback?.();

    await fireEvent.click(keyButton);
    const secondModal = (FuzzySuggestModal as any).__instances.pop();
    expect(secondModal).toBeDefined();
    secondModal.onChooseItem('topic');

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(keyInput.value).toBe('topic');
    expect(plugin.settings.rules[0]).toEqual({ key: 'topic', value: '', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'topic', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));
  });

  it('debounces text input saves and reorganizes on demand', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await Promise.resolve();
    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 't' } });
    await fireEvent.input(keyInput, { target: { value: 'ta' } });
    await fireEvent.input(keyInput, { target: { value: 'tag' } });
    expect(reorganizeSpy).not.toHaveBeenCalled();

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
      rules: [{ key: 'tag', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }],
      maxHistorySize: expect.any(Number),
      moveHistory: expect.any(Array)
    }));

    await fireEvent.click(screen.getByText('Apply now'));
    await flushPromises();
    expect(reorganizeSpy).toHaveBeenCalledTimes(1);
  });

  it('shows warnings for invalid regex values and keeps entries editable', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();
    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'regex' } });
    await flushPromises();
    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: '\\' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const warning = await screen.findByText(/invalid regular expression/i);
    expect(warning.textContent).toMatch(/invalid regular expression/i);
    expect(warning.classList.contains('vault-organizer-rule-error')).toBe(true);
    expect(warning.classList.contains('vault-organizer-rule-warning')).toBe(false);
    expect((Notice as jest.Mock)).toHaveBeenCalledWith(expect.stringContaining('Failed to parse regular expression'));
    expect(plugin.getRuleErrorForIndex(0)).toBeDefined();
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '\\', destination: '', matchType: 'regex', isRegex: true, flags: '', debug: false, enabled: false });
    expect((plugin as any).rules).toEqual([]);
    expect(matchTypeSelect.value).toBe('regex');
  });

  it('keeps non-error warnings styled as warnings', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    // First add a key so we don't get the "key required" warning
    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'status' } });
    await jest.runOnlyPendingTimersAsync();
    await flushPromises();

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'contains' } });
    await flushPromises();

    const warning = await screen.findByText(/value is required for contains\/starts-with\/ends-with rules\./i);
    expect(warning.classList.contains('vault-organizer-rule-warning')).toBe(true);
    expect(warning.classList.contains('vault-organizer-rule-error')).toBe(false);
  });

  it('handles caseInsensitive toggle changes and triggers reorganization', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'status' } });
    await jest.runOnlyPendingTimersAsync();

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: 'Active' } });
    await jest.runOnlyPendingTimersAsync();

    const destInput = await screen.findByPlaceholderText('destination folder (supports {variables})') as HTMLInputElement;
    await fireEvent.input(destInput, { target: { value: 'Projects' } });
    await jest.runOnlyPendingTimersAsync();
    await flushPromises();

    expect(plugin.settings.rules[0]).toEqual({
      key: 'status',
      value: 'Active',
      destination: 'Projects',
      matchType: 'equals',
      debug: false,
      enabled: false
    });

    const caseInsensitiveToggle = (await screen.findByTitle('Case insensitive matching')) as HTMLInputElement;
    expect(caseInsensitiveToggle.checked).toBe(false);

    const saveCallsBefore = (plugin.saveData as jest.Mock).mock.calls.length;
    await fireEvent.click(caseInsensitiveToggle);
    await flushPromises();

    expect((plugin.saveData as jest.Mock).mock.calls.length).toBeGreaterThan(saveCallsBefore);
    expect(plugin.settings.rules[0].caseInsensitive).toBe(true);
    expect(reorganizeSpy).toHaveBeenCalled();
  });

  it('displays error warning when rule has invalid regex after refreshWarnings is called', async () => {
    // Add a rule with invalid regex
    await fireEvent.click(screen.getByText('Add Rule'));
    await flushPromises();

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'regex' } });
    await flushPromises();

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: '/\\' } });
    await jest.runOnlyPendingTimersAsync();
    await flushPromises();

    // Find the warning element that was created
    const warningElements = document.querySelectorAll('.vault-organizer-rule-error');
    expect(warningElements.length).toBeGreaterThan(0);

    const errorElement = Array.from(warningElements).find(el =>
      el.textContent?.includes('Invalid regular expression')
    );
    expect(errorElement).toBeDefined();
    expect(errorElement?.classList.contains('vault-organizer-rule-error')).toBe(true);
  });

  describe('multi-condition UI', () => {
    it('allows adding conditions to a rule via the + button', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Set up the primary rule
      const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
      await fireEvent.input(keyInput, { target: { value: 'status' } });
      await jest.runOnlyPendingTimersAsync();

      const valueInput = screen.getAllByPlaceholderText('value')[0] as HTMLInputElement;
      await fireEvent.input(valueInput, { target: { value: 'active' } });
      await jest.runOnlyPendingTimersAsync();

      const destInput = await screen.findByPlaceholderText('destination folder (supports {variables})') as HTMLInputElement;
      await fireEvent.input(destInput, { target: { value: 'Active' } });
      await jest.runOnlyPendingTimersAsync();
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Verify the condition was added to settings
      expect(plugin.settings.rules[0].conditions).toBeDefined();
      expect(plugin.settings.rules[0].conditions?.length).toBe(1);
      expect(plugin.settings.rules[0].conditions?.[0]).toEqual({
        key: '',
        value: '',
        matchType: 'equals'
      });

      // Verify the UI was re-rendered with the condition
      const conditionName = await screen.findByText('Additional Conditions 1');
      expect(conditionName).toBeDefined();
    });

    it('allows editing condition properties', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all key inputs - index 0 is the main rule, index 1 is the condition
      const allKeyInputs = screen.getAllByPlaceholderText('key') as HTMLInputElement[];
      expect(allKeyInputs.length).toBe(2);
      const conditionKeyInput = allKeyInputs[1];

      // Edit condition key
      await fireEvent.input(conditionKeyInput, { target: { value: 'priority' } });
      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(plugin.settings.rules[0].conditions?.[0].key).toBe('priority');

      // Get all value inputs - index 0 is the main rule, index 1 is the condition
      const allValueInputs = screen.getAllByPlaceholderText('value') as HTMLInputElement[];
      expect(allValueInputs.length).toBe(2);
      const conditionValueInput = allValueInputs[1];

      // Edit condition value
      await fireEvent.input(conditionValueInput, { target: { value: 'high' } });
      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(plugin.settings.rules[0].conditions?.[0].value).toBe('high');
    });

    it('allows removing conditions via the Remove Condition button', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add two conditions
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();
      await fireEvent.click(addConditionButton);
      await flushPromises();

      expect(plugin.settings.rules[0].conditions?.length).toBe(2);

      // Remove the first condition
      const removeButtons = screen.getAllByText('Remove Condition');
      expect(removeButtons.length).toBe(2);
      await fireEvent.click(removeButtons[0]);
      await flushPromises();

      // Verify the first condition was removed
      expect(plugin.settings.rules[0].conditions?.length).toBe(1);
    });

    it('allows changing the condition operator between AND/OR', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Get the condition operator dropdown
      const operatorSelects = screen.getAllByLabelText('Condition operator') as HTMLSelectElement[];
      expect(operatorSelects.length).toBe(1);
      const operatorSelect = operatorSelects[0];

      // Check default value is AND
      expect(plugin.settings.rules[0].conditionOperator).toBeUndefined(); // Default
      expect(operatorSelect.value).toBe('AND');

      // Change to OR
      await fireEvent.change(operatorSelect, { target: { value: 'OR' } });
      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(plugin.settings.rules[0].conditionOperator).toBe('OR');
    });

    it('allows changing condition match type and handles regex controls', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all match type selects - index 0 is main rule, index 1 is condition
      const allMatchTypeSelects = screen.getAllByLabelText('Match type') as HTMLSelectElement[];
      expect(allMatchTypeSelects.length).toBe(2);
      const conditionMatchTypeSelect = allMatchTypeSelects[1];

      // Get all flags inputs - index 0 is main rule, index 1 is condition
      const allFlagsInputs = screen.getAllByPlaceholderText('flags') as HTMLInputElement[];
      expect(allFlagsInputs.length).toBe(2);
      const conditionFlagsInput = allFlagsInputs[1];

      // Flags should be hidden initially
      expect(conditionFlagsInput.style.display).toBe('none');
      expect(conditionFlagsInput.disabled).toBe(true);

      // Change to regex
      await fireEvent.change(conditionMatchTypeSelect, { target: { value: 'regex' } });
      await flushPromises();

      expect(plugin.settings.rules[0].conditions?.[0].matchType).toBe('regex');
      expect(plugin.settings.rules[0].conditions?.[0].isRegex).toBe(true);
      expect(plugin.settings.rules[0].conditions?.[0].flags).toBe('');

      // Flags should now be visible
      expect(conditionFlagsInput.style.display).toBe('');
      expect(conditionFlagsInput.disabled).toBe(false);

      // Add flags
      await fireEvent.input(conditionFlagsInput, { target: { value: 'i' } });
      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(plugin.settings.rules[0].conditions?.[0].flags).toBe('i');
    });

    it('allows toggling case insensitive for conditions', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all case insensitive toggles - index 0 is main rule, index 1 is condition
      const allCaseToggles = screen.getAllByTitle('Case insensitive matching') as HTMLInputElement[];
      expect(allCaseToggles.length).toBe(2);
      const conditionCaseToggle = allCaseToggles[1];

      // Check default value
      expect(conditionCaseToggle.checked).toBe(false);
      expect(plugin.settings.rules[0].conditions?.[0].caseInsensitive).toBeUndefined();

      // Toggle on
      await fireEvent.click(conditionCaseToggle);
      await flushPromises();

      expect(plugin.settings.rules[0].conditions?.[0].caseInsensitive).toBe(true);
    });

    it('hides case insensitive toggle when condition match type is regex', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all match type selects and case toggles
      const allMatchTypeSelects = screen.getAllByLabelText('Match type') as HTMLSelectElement[];
      const allCaseToggles = screen.getAllByTitle('Case insensitive matching') as HTMLInputElement[];
      const conditionMatchTypeSelect = allMatchTypeSelects[1];
      const conditionCaseToggle = allCaseToggles[1];

      // Case toggle should be visible initially
      expect(conditionCaseToggle.style.display).toBe('');

      // Change to regex
      await fireEvent.change(conditionMatchTypeSelect, { target: { value: 'regex' } });
      await flushPromises();

      // Case toggle should now be hidden
      expect(conditionCaseToggle.style.display).toBe('none');
    });

    it('persists multiple conditions with all properties', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Set up primary rule
      const keyInput = screen.getAllByPlaceholderText('key')[0] as HTMLInputElement;
      await fireEvent.input(keyInput, { target: { value: 'status' } });
      await jest.runOnlyPendingTimersAsync();

      const valueInput = screen.getAllByPlaceholderText('value')[0] as HTMLInputElement;
      await fireEvent.input(valueInput, { target: { value: 'active' } });
      await jest.runOnlyPendingTimersAsync();

      const destInput = await screen.findByPlaceholderText('destination folder (supports {variables})') as HTMLInputElement;
      await fireEvent.input(destInput, { target: { value: 'Active' } });
      await jest.runOnlyPendingTimersAsync();
      await flushPromises();

      // Set condition operator to OR
      const operatorSelect = screen.getByLabelText('Condition operator') as HTMLSelectElement;
      await fireEvent.change(operatorSelect, { target: { value: 'OR' } });
      await jest.runOnlyPendingTimersAsync();

      // Add first condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Edit first condition
      const conditionKey1 = screen.getAllByPlaceholderText('key')[1] as HTMLInputElement;
      await fireEvent.input(conditionKey1, { target: { value: 'priority' } });
      await jest.runOnlyPendingTimersAsync();

      const conditionValue1 = screen.getAllByPlaceholderText('value')[1] as HTMLInputElement;
      await fireEvent.input(conditionValue1, { target: { value: 'high' } });
      await jest.runOnlyPendingTimersAsync();

      // Add second condition
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Edit second condition with regex
      const conditionKey2 = screen.getAllByPlaceholderText('key')[2] as HTMLInputElement;
      await fireEvent.input(conditionKey2, { target: { value: 'tag' } });
      await jest.runOnlyPendingTimersAsync();

      const conditionValue2 = screen.getAllByPlaceholderText('value')[2] as HTMLInputElement;
      await fireEvent.input(conditionValue2, { target: { value: 'important' } });
      await jest.runOnlyPendingTimersAsync();

      const conditionMatchType2 = screen.getAllByLabelText('Match type')[2] as HTMLSelectElement;
      await fireEvent.change(conditionMatchType2, { target: { value: 'contains' } });
      await flushPromises();

      const conditionCaseToggle2 = screen.getAllByTitle('Case insensitive matching')[2] as HTMLInputElement;
      await fireEvent.click(conditionCaseToggle2);
      await flushPromises();

      // Verify final state
      expect(plugin.settings.rules[0]).toMatchObject({
        key: 'status',
        value: 'active',
        destination: 'Active',
        matchType: 'equals',
        conditionOperator: 'OR',
        conditions: [
          {
            key: 'priority',
            value: 'high',
            matchType: 'equals'
          },
          {
            key: 'tag',
            value: 'important',
            matchType: 'contains',
            caseInsensitive: true
          }
        ]
      });
    });

    it('allows using frontmatter key picker for conditions', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all frontmatter key buttons - index 0 is main rule, index 1 is condition
      const keyButtons = screen.getAllByTitle('Browse frontmatter keys');
      expect(keyButtons.length).toBe(2);
      const conditionKeyButton = keyButtons[1];

      await fireEvent.click(conditionKeyButton);

      const modalInstance = (FuzzySuggestModal as any).__instances.pop();
      expect(modalInstance).toBeDefined();
      modalInstance.onChooseItem('category');

      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      const conditionKeyInput = screen.getAllByPlaceholderText('key')[1] as HTMLInputElement;
      expect(conditionKeyInput.value).toBe('category');
      expect(plugin.settings.rules[0].conditions?.[0].key).toBe('category');
    });

    it('allows using tag picker for condition values', async () => {
      await fireEvent.click(screen.getByText('Add Rule'));
      await flushPromises();

      // Add a condition
      const addConditionButton = screen.getByTitle('Add another condition to this rule');
      await fireEvent.click(addConditionButton);
      await flushPromises();

      // Get all tag buttons - index 0 is main rule, index 1 is condition
      const tagButtons = screen.getAllByTitle('Browse tags');
      expect(tagButtons.length).toBe(2);
      const conditionTagButton = tagButtons[1];

      await fireEvent.click(conditionTagButton);

      const modalInstance = (FuzzySuggestModal as any).__instances.pop();
      expect(modalInstance).toBeDefined();
      modalInstance.onChooseItem('#daily');

      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();

      const conditionValueInput = screen.getAllByPlaceholderText('value')[1] as HTMLInputElement;
      expect(conditionValueInput.value).toBe('#daily');
      expect(plugin.settings.rules[0].conditions?.[0].value).toBe('#daily');
    });
  });

  describe('exclusion patterns UI', () => {
    it('displays exclusion patterns section', async () => {
      tab.display();
      await flushPromises();

      const heading = screen.getByText('Exclusion Patterns');
      expect(heading).toBeDefined();
    });

    it('shows add pattern button', async () => {
      tab.display();
      await flushPromises();

      const addButton = screen.getByText('Add Pattern');
      expect(addButton).toBeDefined();
    });

    it('displays existing exclusion patterns', async () => {
      plugin.settings.excludePatterns = ['Templates/**', '*.excalidraw.md'];
      tab.display();
      await flushPromises();

      const patterns = screen.getAllByPlaceholderText(/e\.g\., Templates/);
      expect(patterns.length).toBe(2);
      expect((patterns[0] as HTMLInputElement).value).toBe('Templates/**');
      expect((patterns[1] as HTMLInputElement).value).toBe('*.excalidraw.md');
    });

    it('allows adding new exclusion pattern', async () => {
      tab.display();
      await flushPromises();

      const addButton = screen.getByText('Add Pattern');
      await fireEvent.click(addButton);
      await flushPromises();

      // After clicking Add Pattern, the in-memory settings should have an empty pattern
      // The UI re-renders with this pattern, showing an input field
      expect(plugin.settings.excludePatterns.length).toBe(1);
      expect(plugin.settings.excludePatterns[0]).toBe('');

      // And the UI should show an input field for entering the new pattern
      const patternInputs = screen.queryAllByPlaceholderText(/e\.g\., Templates/);
      expect(patternInputs.length).toBe(1);
    });

    it('allows editing exclusion patterns', async () => {
      plugin.settings.excludePatterns = [''];
      tab.display();
      await flushPromises();

      const patternInput = screen.getByPlaceholderText(/e\.g\., Templates/) as HTMLInputElement;
      await fireEvent.input(patternInput, { target: { value: 'Archive/**' } });
      await jest.runOnlyPendingTimersAsync();

      expect(plugin.settings.excludePatterns[0]).toBe('Archive/**');
    });

    it('allows removing exclusion patterns', async () => {
      plugin.settings.excludePatterns = ['Templates/**', '*.excalidraw.md'];
      tab.display();
      await flushPromises();

      const removeButtons = screen.getAllByText('Remove').filter(btn =>
        (btn as HTMLElement).title === 'Remove this exclusion pattern'
      );
      expect(removeButtons.length).toBe(2);

      await fireEvent.click(removeButtons[0]);
      await flushPromises();

      expect(plugin.settings.excludePatterns.length).toBe(1);
      expect(plugin.settings.excludePatterns[0]).toBe('*.excalidraw.md');
    });

    it('displays common pattern templates', async () => {
      tab.display();
      await flushPromises();

      const templatesHeading = screen.getByText('Common Patterns');
      expect(templatesHeading).toBeDefined();

      // Check for template buttons
      const addButtons = Array.from(document.querySelectorAll('.vault-organizer-template-add-btn'));
      expect(addButtons.length).toBeGreaterThan(0);
    });

    it('allows adding common pattern template', async () => {
      tab.display();
      await flushPromises();

      const addButtons = Array.from(document.querySelectorAll('.vault-organizer-template-add-btn')) as HTMLButtonElement[];
      expect(addButtons.length).toBeGreaterThan(0);

      // Click first template add button
      await fireEvent.click(addButtons[0]);
      await flushPromises();

      expect(plugin.settings.excludePatterns.length).toBe(1);
      expect(plugin.settings.excludePatterns[0]).toBe('Templates/**');
    });

    it('prevents adding duplicate patterns from templates', async () => {
      plugin.settings.excludePatterns = ['Templates/**'];
      tab.display();
      await flushPromises();

      const addButtons = Array.from(document.querySelectorAll('.vault-organizer-template-add-btn')) as HTMLButtonElement[];

      // Try to add Templates/** again (it's the first template)
      await fireEvent.click(addButtons[0]);
      await flushPromises();

      // Should still only have 1 pattern
      expect(plugin.settings.excludePatterns.length).toBe(1);
      expect(plugin.settings.excludePatterns[0]).toBe('Templates/**');
    });

    it('validates pattern input in real-time', async () => {
      plugin.settings.excludePatterns = [''];
      tab.display();
      await flushPromises();

      const patternInput = screen.getByPlaceholderText(/e\.g\., Templates/) as HTMLInputElement;

      // Enter invalid pattern with invalid characters
      await fireEvent.input(patternInput, { target: { value: 'test<>|' } });
      await jest.runOnlyPendingTimersAsync();

      // Input should have invalid class
      expect(patternInput.classList.contains('vault-organizer-invalid-pattern')).toBe(true);
      expect(patternInput.title).toContain('invalid');
    });

    it('removes invalid class when pattern becomes valid', async () => {
      plugin.settings.excludePatterns = [''];
      tab.display();
      await flushPromises();

      const patternInput = screen.getByPlaceholderText(/e\.g\., Templates/) as HTMLInputElement;

      // Enter invalid pattern
      await fireEvent.input(patternInput, { target: { value: 'test<>|' } });
      await jest.runOnlyPendingTimersAsync();
      expect(patternInput.classList.contains('vault-organizer-invalid-pattern')).toBe(true);

      // Fix pattern
      await fireEvent.input(patternInput, { target: { value: 'test/**' } });
      await jest.runOnlyPendingTimersAsync();
      expect(patternInput.classList.contains('vault-organizer-invalid-pattern')).toBe(false);
    });
  });
});


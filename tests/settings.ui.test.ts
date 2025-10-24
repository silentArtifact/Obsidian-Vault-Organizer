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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }] });
    expect((plugin as any).rules).toEqual([{ key: '', matchType: 'equals', value: '', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'tag' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: '', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: 'journal' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: '', matchType: 'equals', debug: false, enabled: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: 'journal', destination: '', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const destInput = await screen.findByPlaceholderText('destination folder (required)') as HTMLInputElement;
    await fireEvent.input(destInput, { target: { value: 'Journal' } });
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'equals', debug: false, enabled: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', debug: false, enabled: false }]);
    expect(reorganizeSpy).not.toHaveBeenCalled();

    const flagsInput = await screen.findByPlaceholderText('flags') as HTMLInputElement;
    expect(flagsInput.style.display).toBe('none');
    expect(flagsInput.disabled).toBe(true);

    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'regex' } });
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(5);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: '', debug: false, enabled: false }] });
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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: false, enabled: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: false, enabled: false }]);
    expect(((plugin as any).rules[0].value as RegExp).flags).toBe('i');
    expect(reorganizeSpy).toHaveBeenCalledTimes(1);

    const activationToggle = (await screen.findByTitle('Activate this rule')) as HTMLInputElement;
    expect(activationToggle.checked).toBe(false);
    await fireEvent.click(activationToggle);
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(7);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: false, enabled: true }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: false, enabled: true }]);
    expect(reorganizeSpy).toHaveBeenCalledTimes(2);

    const debugToggle = (await screen.findByTitle('Enable debug mode')) as HTMLInputElement;
    await fireEvent.click(debugToggle);
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(8);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', matchType: 'regex', isRegex: true, flags: 'i', debug: true, enabled: true }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', matchType: 'regex', value: expect.any(RegExp), destination: 'Journal', debug: true, enabled: true }]);
    expect(reorganizeSpy).toHaveBeenCalledTimes(3);

    await fireEvent.click(screen.getByText('Remove'));
    await flushPromises();
    expect(plugin.saveData).toHaveBeenCalledTimes(9);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [] });
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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '#daily', destination: '', matchType: 'equals', debug: false, enabled: false }] });

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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '#daily #ideas', destination: '', matchType: 'equals', debug: false, enabled: false }] });

    await fireEvent.click(tagButton);
    const thirdModal = (FuzzySuggestModal as any).__instances.pop();
    expect(thirdModal).toBeDefined();
    thirdModal.onChooseItem('#daily');
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(valueInput.value).toBe('#ideas');
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '#ideas', destination: '', matchType: 'equals', debug: false, enabled: false });
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '#ideas', destination: '', matchType: 'equals', debug: false, enabled: false }] });
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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'category', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }] });

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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'topic', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }] });
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
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: '', destination: '', matchType: 'equals', debug: false, enabled: false }] });

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
    const matchTypeSelect = screen.getByLabelText('Match type') as HTMLSelectElement;
    await fireEvent.change(matchTypeSelect, { target: { value: 'contains' } });
    await flushPromises();

    const warning = await screen.findByText(/value is required for contains\/starts-with\/ends-with rules\./i);
    expect(warning.classList.contains('vault-organizer-rule-warning')).toBe(true);
    expect(warning.classList.contains('vault-organizer-rule-error')).toBe(false);
  });
});


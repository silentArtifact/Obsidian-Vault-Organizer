/**
 * @jest-environment jsdom
 */

jest.mock('obsidian', () => {
  class Plugin {
    app: any;
    constructor(app: any) {
      this.app = app;
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
        onChange: (fn: (v: string) => void) => { input.addEventListener('input', e => fn((e.target as HTMLInputElement).value)); return api; },
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
      };
      cb(api);
      return this;
    }
    addButton(cb: (api: any) => void) {
      const button = document.createElement('button');
      this.settingEl.appendChild(button);
      const api = {
        setButtonText: (t: string) => { button.textContent = t; return api; },
        onClick: (fn: () => void) => { button.addEventListener('click', fn); return api; },
      };
      cb(api);
      return this;
    }
  }

  const Notice = jest.fn().mockImplementation(function (this: any, message: string) {
    this.message = message;
  });

  return { Plugin, PluginSettingTab, Setting, Notice };
}, { virtual: true });

import VaultOrganizer from '../main';
import { screen, fireEvent } from '@testing-library/dom';

const { Notice } = jest.requireMock('obsidian');

describe('settings UI', () => {
  let plugin: VaultOrganizer;
  let tab: any;

  beforeEach(async () => {
    (Notice as jest.Mock).mockClear();
    const app = { metadataCache: {}, fileManager: {}, vault: { on: jest.fn() } } as any;
    plugin = new VaultOrganizer(app);
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    plugin.addSettingTab = jest.fn();
    await plugin.onload();
    tab = (plugin.addSettingTab as jest.Mock).mock.calls[0][0];
    tab.display();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('persists updated rules on UI interactions', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '', destination: '', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: '', value: '', destination: '', debug: false }]);

    const keyInput = await screen.findByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'tag' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: '', destination: '', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: '', destination: '', debug: false }]);

    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: 'journal' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: '', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: 'journal', destination: '', debug: false }]);

    const destInput = await screen.findByPlaceholderText('destination folder (required)') as HTMLInputElement;
    await fireEvent.input(destInput, { target: { value: 'Journal' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: 'journal', destination: 'Journal', debug: false }]);

    const regexToggle = (await screen.findByTitle('Treat value as a regular expression')) as HTMLInputElement;
    await fireEvent.click(regexToggle);
    expect(plugin.saveData).toHaveBeenCalledTimes(5);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', isRegex: true, flags: '', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: expect.any(RegExp), destination: 'Journal', debug: false }]);
    expect(((plugin as any).rules[0].value as RegExp).source).toBe('journal');
    expect(((plugin as any).rules[0].value as RegExp).flags).toBe('');

    const flagsInput = await screen.findByPlaceholderText('flags') as HTMLInputElement;
    await fireEvent.input(flagsInput, { target: { value: 'i' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(6);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', isRegex: true, flags: 'i', debug: false }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: expect.any(RegExp), destination: 'Journal', debug: false }]);
    expect(((plugin as any).rules[0].value as RegExp).flags).toBe('i');

    const debugToggle = (await screen.findByTitle('Enable debug mode')) as HTMLInputElement;
    await fireEvent.click(debugToggle);
    expect(plugin.saveData).toHaveBeenCalledTimes(7);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', isRegex: true, flags: 'i', debug: true }] });
    expect((plugin as any).rules).toEqual([{ key: 'tag', value: expect.any(RegExp), destination: 'Journal', debug: true }]);

    await fireEvent.click(screen.getByText('Remove'));
    expect(plugin.saveData).toHaveBeenCalledTimes(8);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [] });
    expect((plugin as any).rules).toEqual([]);
    expect((Notice as jest.Mock)).not.toHaveBeenCalled();
  });

  it('shows warnings for invalid regex values and keeps entries editable', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    const regexToggle = (await screen.findByTitle('Treat value as a regular expression')) as HTMLInputElement;
    await fireEvent.click(regexToggle);
    const valueInput = await screen.findByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: '\\' } });

    const warning = await screen.findByText(/invalid regular expression/i);
    expect(warning.textContent).toMatch(/invalid regular expression/i);
    expect((Notice as jest.Mock)).toHaveBeenCalledWith(expect.stringContaining('Failed to parse regular expression'));
    expect(plugin.getRuleErrorForIndex(0)).toBeDefined();
    expect(plugin.settings.rules[0]).toEqual({ key: '', value: '\\', destination: '', isRegex: true, flags: '', debug: false });
    expect((plugin as any).rules).toEqual([]);
    expect(regexToggle.checked).toBe(true);
  });
});


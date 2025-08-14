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
      containerEl.appendChild(this.settingEl);
    }
    setName(_name: string) { return this; }
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
        setTooltip: (_: string) => api,
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

  return { Plugin, PluginSettingTab, Setting };
}, { virtual: true });

import VaultOrganizer from '../main';
import { screen, fireEvent } from '@testing-library/dom';

describe('settings UI', () => {
  let plugin: VaultOrganizer;
  let tab: any;

  beforeEach(async () => {
    const app = { metadataCache: {}, fileManager: {}, vault: { on: jest.fn() } } as any;
    plugin = new VaultOrganizer(app);
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    plugin.addSettingTab = jest.fn();
    await plugin.onload();
    tab = (plugin.addSettingTab as jest.Mock).mock.calls[0][0];
    tab.display();
  });

  it('persists updated rules on UI interactions', async () => {
    await fireEvent.click(screen.getByText('Add Rule'));
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: '', value: '', destination: '', debug: false }] });

    const keyInput = screen.getByPlaceholderText('key') as HTMLInputElement;
    await fireEvent.input(keyInput, { target: { value: 'tag' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: '', destination: '', debug: false }] });

    const valueInput = screen.getByPlaceholderText('value') as HTMLInputElement;
    await fireEvent.input(valueInput, { target: { value: 'journal' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(3);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: '', debug: false }] });

    const destInput = screen.getByPlaceholderText('destination') as HTMLInputElement;
    await fireEvent.input(destInput, { target: { value: 'Journal' } });
    expect(plugin.saveData).toHaveBeenCalledTimes(4);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', debug: false }] });

    const toggle = screen.getByRole('checkbox') as HTMLInputElement;
    await fireEvent.click(toggle);
    expect(plugin.saveData).toHaveBeenCalledTimes(5);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [{ key: 'tag', value: 'journal', destination: 'Journal', debug: true }] });

    await fireEvent.click(screen.getByText('Remove'));
    expect(plugin.saveData).toHaveBeenCalledTimes(6);
    expect(plugin.saveData).toHaveBeenLastCalledWith({ rules: [] });
  });
});


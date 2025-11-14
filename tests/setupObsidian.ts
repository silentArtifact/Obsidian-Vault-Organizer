/**
 * Shared Obsidian module mock setup for all tests
 * Import this file at the top of your test file to use the mocked Obsidian API
 */

jest.mock('obsidian', () => {
  const noticeMock = jest.fn();

  /**
   * Mock TFile class for testing
   */
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

  /**
   * Mock debounce function with run and cancel capabilities
   */
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

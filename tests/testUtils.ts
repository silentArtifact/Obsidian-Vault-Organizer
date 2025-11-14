/**
 * Shared test utilities and mock factories for Vault Organizer tests
 */

import { TFile } from 'obsidian';

/**
 * Default plugin manifest for testing
 */
export const TEST_MANIFEST = {
  id: 'obsidian-vault-organizer',
  name: 'Vault Organizer',
  version: '1.0.0',
  minAppVersion: '1.0.0',
  description: 'Test description',
  author: 'Test Author',
  authorUrl: '',
  dir: 'vault-organizer',
  isDesktopOnly: false,
};

/**
 * Creates a mock TFile instance for testing
 * @param path - The file path
 * @returns A mock TFile object
 */
export function createMockFile(path: string): TFile {
  return new (TFile as unknown as { new(path: string): TFile })(path);
}

/**
 * Creates a mock Obsidian Vault object
 * @param overrides - Optional overrides for vault properties
 * @returns A mock vault object with common methods
 */
export function createMockVault(overrides?: any) {
  return {
    getName: jest.fn(() => 'TestVault'),
    getAbstractFileByPath: jest.fn(),
    getMarkdownFiles: jest.fn(() => []),
    createFolder: jest.fn(),
    on: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock Obsidian MetadataCache object
 * @param overrides - Optional overrides for metadata cache properties
 * @returns A mock metadata cache object
 */
export function createMockMetadataCache(overrides?: any) {
  return {
    getFileCache: jest.fn(),
    on: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock Obsidian FileManager object
 * @param overrides - Optional overrides for file manager properties
 * @returns A mock file manager object
 */
export function createMockFileManager(overrides?: any) {
  return {
    renameFile: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates a complete mock Obsidian App object
 * @param overrides - Optional overrides for app properties
 * @returns A mock app object with vault, metadataCache, and fileManager
 */
export function createMockApp(overrides?: any) {
  return {
    vault: createMockVault(),
    metadataCache: createMockMetadataCache(),
    fileManager: createMockFileManager(),
    ...overrides,
  };
}

/**
 * Sets up event handler tracking for vault and metadata cache
 * @param vault - The vault mock object
 * @param metadataCache - The metadata cache mock object
 * @returns Object containing event handler tracking
 */
export function setupEventHandlers(vault: any, metadataCache: any) {
  const fileEventHandlers: Record<string, (file: any, ...args: any[]) => Promise<void> | void> = {};
  const handlers = {
    metadataChangedHandler: undefined as ((file: any) => Promise<void> | void) | undefined
  };

  vault.on.mockImplementation((event: string, cb: any) => {
    fileEventHandlers[event] = cb;
    return {};
  });

  metadataCache.on.mockImplementation((event: string, cb: any) => {
    if (event === 'changed') {
      handlers.metadataChangedHandler = cb;
    }
    return {};
  });

  return {
    fileEventHandlers,
    get metadataChangedHandler() {
      return handlers.metadataChangedHandler;
    }
  };
}

/**
 * Sets up folder tracking for vault mock
 * @param vault - The vault mock object
 * @returns Set of existing folders for tracking
 */
export function setupFolderTracking(vault: any): Set<string> {
  const existingFolders = new Set<string>();

  vault.getAbstractFileByPath.mockImplementation((path: string) =>
    existingFolders.has(path) ? ({ path }) : null
  );

  vault.createFolder.mockImplementation(async (path: string) => {
    existingFolders.add(path);
  });

  return existingFolders;
}

/**
 * Creates a helper function to add rules to a plugin
 * @param plugin - The VaultOrganizer plugin instance
 * @returns Function to add rules to the plugin
 */
export function createRuleHelper(plugin: any) {
  return {
    /**
     * Adds a rule to the plugin and refreshes
     */
    addRule: async (rule: any) => {
      plugin.settings.rules.push({ enabled: true, ...rule });
      plugin.updateRulesFromSettings();
    },

    /**
     * Clears all rules from the plugin
     */
    clearRules: async () => {
      plugin.settings.rules.splice(0, plugin.settings.rules.length);
      plugin.updateRulesFromSettings();
    },

    /**
     * Adds a rule and saves settings (triggers full refresh)
     */
    addRuleViaSettings: async (rule: any) => {
      plugin.settings.rules.splice(0, plugin.settings.rules.length);
      plugin.settings.rules.push({ enabled: true, ...rule });
      await plugin.saveSettingsAndRefreshRules();
    },
  };
}

/**
 * Common test rule templates
 */
export const TEST_RULES = {
  /**
   * Creates a rule that matches frontmatter with equals operator
   */
  equalsRule: (key: string, value: string, destinationFolder: string) => ({
    frontmatterKey: key,
    operator: 'equals' as const,
    value,
    destinationFolder,
    enabled: true,
  }),

  /**
   * Creates a rule that matches frontmatter with contains operator
   */
  containsRule: (key: string, value: string, destinationFolder: string) => ({
    frontmatterKey: key,
    operator: 'contains' as const,
    value,
    destinationFolder,
    enabled: true,
  }),

  /**
   * Creates a rule that matches frontmatter with regex operator
   */
  regexRule: (key: string, pattern: string, destinationFolder: string) => ({
    frontmatterKey: key,
    operator: 'regex' as const,
    value: pattern,
    destinationFolder,
    enabled: true,
  }),

  /**
   * Creates a rule that matches frontmatter exists
   */
  existsRule: (key: string, destinationFolder: string) => ({
    frontmatterKey: key,
    operator: 'exists' as const,
    value: '',
    destinationFolder,
    enabled: true,
  }),
};

/**
 * Common test frontmatter examples
 */
export const TEST_FRONTMATTER = {
  basic: {
    title: 'Test Note',
    tags: ['test'],
  },

  withCategory: {
    title: 'Categorized Note',
    category: 'work',
    tags: ['important'],
  },

  withProject: {
    title: 'Project Note',
    project: 'MyProject',
    status: 'active',
  },

  withArray: {
    title: 'Array Note',
    tags: ['tag1', 'tag2', 'tag3'],
  },
};

jest.mock('obsidian', () => {
    const noticeMock = jest.fn();
    class TFile {
        path: string;
        name: string;
        basename: string;
        extension: string;
        constructor(path?: string) {
            this.path = path || '';
            this.name = path ? path.split('/').pop()! : '';
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
        normalizePath: (p: string) => p.replace(/\\/g, '/'),
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

import { TFile, Notice } from 'obsidian';
import VaultOrganizer from '../main';

describe('Undo Functionality', () => {
    let plugin: VaultOrganizer;
    let mockApp: any;
    let mockVault: any;
    let mockFileManager: any;
    let mockMetadataCache: any;

    beforeEach(async () => {
        // Clear all mocks
        jest.clearAllMocks();

        // Setup mocks
        mockVault = {
            getAbstractFileByPath: jest.fn(),
            getMarkdownFiles: jest.fn(() => []),
            createFolder: jest.fn(),
            on: jest.fn(),
            getName: jest.fn(() => 'TestVault'),
        };

        mockFileManager = {
            renameFile: jest.fn(),
        };

        mockMetadataCache = {
            getFileCache: jest.fn(),
            on: jest.fn(),
        };

        mockApp = {
            vault: mockVault,
            fileManager: mockFileManager,
            metadataCache: mockMetadataCache,
        };

        plugin = new VaultOrganizer(mockApp, {
            id: 'test-plugin',
            name: 'Test Plugin',
            author: 'Test',
            version: '1.0.0',
            minAppVersion: '0.15.0',
            dir: '',
        } as any);

        await plugin.loadSettings();
        plugin.settings.moveHistory = [];
        plugin.settings.maxHistorySize = 50;
    });

    describe('recordMove', () => {
        it('should add a move to history', async () => {
            const fromPath = 'folder1/test.md';
            const toPath = 'folder2/test.md';
            const fileName = 'test.md';
            const ruleKey = 'status';

            await (plugin as any).recordMove(fromPath, toPath, fileName, ruleKey);

            expect(plugin.settings.moveHistory).toHaveLength(1);
            expect(plugin.settings.moveHistory[0]).toMatchObject({
                fromPath,
                toPath,
                fileName,
                ruleKey,
            });
            expect(plugin.settings.moveHistory[0].timestamp).toBeGreaterThan(0);
        });

        it('should add new moves to the beginning of history', async () => {
            await (plugin as any).recordMove('path1/a.md', 'path2/a.md', 'a.md', 'key1');
            await (plugin as any).recordMove('path3/b.md', 'path4/b.md', 'b.md', 'key2');

            expect(plugin.settings.moveHistory).toHaveLength(2);
            expect(plugin.settings.moveHistory[0].fileName).toBe('b.md');
            expect(plugin.settings.moveHistory[1].fileName).toBe('a.md');
        });

        it('should trim history when it exceeds maxHistorySize', async () => {
            plugin.settings.maxHistorySize = 3;

            for (let i = 0; i < 5; i++) {
                await (plugin as any).recordMove(
                    `path${i}/file.md`,
                    `dest${i}/file.md`,
                    `file${i}.md`,
                    'key'
                );
            }

            expect(plugin.settings.moveHistory).toHaveLength(3);
            expect(plugin.settings.moveHistory[0].fileName).toBe('file4.md');
            expect(plugin.settings.moveHistory[2].fileName).toBe('file2.md');
        });
    });

    describe('undoLastMove', () => {
        it('should show notice when history is empty', async () => {
            await plugin.undoLastMove();

            expect(Notice).toHaveBeenCalledWith('No moves to undo.');
        });

        it('should undo the last move successfully', async () => {
            const mockFile = new TFile('folder2/test.md');

            plugin.settings.moveHistory = [{
                timestamp: Date.now(),
                fileName: 'test.md',
                fromPath: 'folder1/test.md',
                toPath: 'folder2/test.md',
                ruleKey: 'status',
            }];

            mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'folder2/test.md') return mockFile;
                return null;
            });

            mockFileManager.renameFile.mockResolvedValue(undefined);

            await plugin.undoLastMove();

            expect(mockFileManager.renameFile).toHaveBeenCalledWith(mockFile, 'folder1/test.md');
            expect(plugin.settings.moveHistory).toHaveLength(0);
        });

        it('should handle file not found at current location', async () => {
            plugin.settings.moveHistory = [{
                timestamp: Date.now(),
                fileName: 'test.md',
                fromPath: 'folder1/test.md',
                toPath: 'folder2/test.md',
                ruleKey: 'status',
            }];

            mockVault.getAbstractFileByPath.mockReturnValue(null);

            await plugin.undoLastMove();

            expect(Notice).toHaveBeenCalledWith(
                expect.stringContaining('File no longer exists')
            );
            expect(plugin.settings.moveHistory).toHaveLength(0);
        });

        it('should handle file already exists at destination', async () => {
            const mockCurrentFile = new TFile('folder2/test.md');
            const mockExistingFile = new TFile('folder1/test.md');

            plugin.settings.moveHistory = [{
                timestamp: Date.now(),
                fileName: 'test.md',
                fromPath: 'folder1/test.md',
                toPath: 'folder2/test.md',
                ruleKey: 'status',
            }];

            mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'folder2/test.md') return mockCurrentFile;
                if (path === 'folder1/test.md') return mockExistingFile;
                return null;
            });

            await plugin.undoLastMove();

            expect(Notice).toHaveBeenCalledWith(
                expect.stringContaining('A file already exists')
            );
            expect(plugin.settings.moveHistory).toHaveLength(1); // Not removed
        });

        it('should create necessary folders when undoing', async () => {
            const mockFile = new TFile('dest/test.md');

            plugin.settings.moveHistory = [{
                timestamp: Date.now(),
                fileName: 'test.md',
                fromPath: 'deeply/nested/folder/test.md',
                toPath: 'dest/test.md',
                ruleKey: 'status',
            }];

            mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'dest/test.md') return mockFile;
                return null;
            });

            mockFileManager.renameFile.mockResolvedValue(undefined);
            mockVault.createFolder.mockResolvedValue(undefined);

            await plugin.undoLastMove();

            expect(mockVault.createFolder).toHaveBeenCalledWith('deeply');
            expect(mockVault.createFolder).toHaveBeenCalledWith('deeply/nested');
            expect(mockVault.createFolder).toHaveBeenCalledWith('deeply/nested/folder');
            expect(mockFileManager.renameFile).toHaveBeenCalledWith(
                mockFile,
                'deeply/nested/folder/test.md'
            );
        });

        it('should handle rename errors gracefully', async () => {
            const mockFile = new TFile('folder2/test.md');

            plugin.settings.moveHistory = [{
                timestamp: Date.now(),
                fileName: 'test.md',
                fromPath: 'folder1/test.md',
                toPath: 'folder2/test.md',
                ruleKey: 'status',
            }];

            mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'folder2/test.md') return mockFile;
                return null;
            });

            const error = new Error('Permission denied');
            mockFileManager.renameFile.mockRejectedValue(error);

            await plugin.undoLastMove();

            expect(Notice).toHaveBeenCalledWith(
                expect.stringContaining('Permission denied')
            );
            // History should not be cleared on error
            expect(plugin.settings.moveHistory).toHaveLength(1);
        });
    });

    describe('Move History Integration', () => {
        it('should record moves when applyRulesToFile succeeds', async () => {
            const mockFile = new TFile('inbox/test.md');

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: { status: 'done' },
            });

            plugin.settings.rules = [{
                key: 'status',
                value: 'done',
                destination: 'completed',
                matchType: 'equals',
                enabled: true,
            }];
            plugin.updateRulesFromSettings();

            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockVault.createFolder.mockResolvedValue(undefined);
            mockFileManager.renameFile.mockResolvedValue(undefined);

            await (plugin as any).applyRulesToFile(mockFile);

            expect(plugin.settings.moveHistory).toHaveLength(1);
            expect(plugin.settings.moveHistory[0]).toMatchObject({
                fromPath: 'inbox/test.md',
                toPath: 'completed/test.md',
                fileName: 'test.md',
                ruleKey: 'status',
            });
        });

        it('should not record moves when in debug mode', async () => {
            const mockFile = new TFile('inbox/test.md');

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: { status: 'done' },
            });

            plugin.settings.rules = [{
                key: 'status',
                value: 'done',
                destination: 'completed',
                matchType: 'equals',
                enabled: true,
                debug: true,
            }];
            plugin.updateRulesFromSettings();

            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockVault.getName = jest.fn(() => 'TestVault');

            await (plugin as any).applyRulesToFile(mockFile);

            expect(plugin.settings.moveHistory).toHaveLength(0);
            expect(mockFileManager.renameFile).not.toHaveBeenCalled();
        });
    });
});

import {
    Plugin,
    TAbstractFile,
    TFile,
    Notice,
} from 'obsidian';
import {
    FrontmatterRule,
    deserializeFrontmatterRules,
    FrontmatterRuleDeserializationError,
    matchFrontmatter,
    serializeFrontmatterRules,
} from './src/rules';
import {
    VaultOrganizerError,
    FileConflictError,
    categorizeError,
} from './src/errors';
import {
    validateDestinationPath,
    validatePath,
} from './src/pathSanitization';
import {
    VaultOrganizerSettings,
    DEFAULT_SETTINGS,
    MoveHistoryEntry,
    RuleTestResult,
    normalizeSerializedRule,
} from './src/types';
import { RuleSettingTab } from './src/ui/settings';
import { MoveHistoryModal } from './src/ui/modals';

export default class VaultOrganizer extends Plugin {
    settings: VaultOrganizerSettings;
    private rules: FrontmatterRule[] = [];
    private ruleParseErrors: FrontmatterRuleDeserializationError[] = [];
    private ruleSettingTab?: RuleSettingTab;

    /**
     * Called when the plugin is loaded. Initializes settings, registers event handlers,
     * and sets up commands for reorganizing files and managing move history.
     *
     * Registers event handlers for:
     * - File modifications, creations, and renames
     * - Metadata cache changes
     *
     * Registers commands:
     * - Reorganize notes based on frontmatter rules
     * - Undo last automatic move
     * - View move history
     */
    async onload() {
        await this.loadSettings();
        this.updateRulesFromSettings();

        const handleFileChange = async (file: TAbstractFile) => {
            if (!(file instanceof TFile) || file.extension !== 'md') {
                return;
            }

            await this.applyRulesToFile(file);
        };

        this.registerEvent(this.app.vault.on('modify', handleFileChange));
        this.registerEvent(this.app.vault.on('create', handleFileChange));
        this.registerEvent(this.app.vault.on('rename', handleFileChange));
        this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') {
                return;
            }

            await this.applyRulesToFile(file);
        }));

        this.addCommand({
            id: 'obsidian-vault-organizer-apply-rules',
            name: 'Reorganize notes based on frontmatter rules',
            callback: async () => {
                await this.reorganizeAllMarkdownFiles();
            },
        });

        this.addCommand({
            id: 'obsidian-vault-organizer-undo-last-move',
            name: 'Undo last automatic move',
            callback: async () => {
                await this.undoLastMove();
            },
        });

        this.addCommand({
            id: 'obsidian-vault-organizer-view-history',
            name: 'View move history',
            callback: () => {
                new MoveHistoryModal(this.app, this).open();
            },
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.ruleSettingTab = new RuleSettingTab(this.app, this);
        this.addSettingTab(this.ruleSettingTab);
    }

    /**
     * Called when the plugin is unloaded. Performs any necessary cleanup operations.
     */
    onunload() {
        // Plugin cleanup if needed
    }

    /**
     * Loads plugin settings from persistent storage and merges them with default values.
     * Normalizes rule data and ensures move history doesn't exceed the configured maximum size.
     */
    async loadSettings() {
        const loaded = await this.loadData();
        const rules = Array.isArray(loaded?.rules)
            ? loaded.rules.map(normalizeSerializedRule)
            : [];
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loaded,
            rules,
            moveHistory: Array.isArray(loaded?.moveHistory) ? loaded.moveHistory : [],
            maxHistorySize: loaded?.maxHistorySize ?? DEFAULT_SETTINGS.maxHistorySize,
        };
    }

    /**
     * Persists current plugin settings to storage.
     */
    async saveSettings() {
        this.settings.rules = this.settings.rules.map(normalizeSerializedRule);
        await this.saveData(this.settings);
    }

    /**
     * Deserializes and updates frontmatter rules from the current settings.
     * Parses rule definitions and separates valid rules from those with errors.
     *
     * @returns An object containing successfully parsed rules and any deserialization errors
     */
    updateRulesFromSettings() {
        const { rules, successes, errors } = deserializeFrontmatterRules(this.settings.rules);
        this.rules = rules;
        this.ruleParseErrors = errors;
        return { successes, errors };
    }

    private async persistSettingsAndRefreshRules() {
        const { successes, errors } = this.updateRulesFromSettings();
        const serializedRules = serializeFrontmatterRules(successes.map(success => success.rule));
        const nextRules = [...this.settings.rules];
        successes.forEach((success, index) => {
            nextRules[success.index] = serializedRules[index];
        });
        this.settings.rules = nextRules;
        await this.saveSettings();
        if (errors.length) {
            errors.forEach(error => {
                const ruleKey = error.rule.key || '(unnamed rule)';
                const noticeMessage = `Failed to parse regular expression for rule "${ruleKey}": ${error.message}`;
                new Notice(noticeMessage);
            });
        }
        this.ruleSettingTab?.refreshWarnings();
    }

    /**
     * Saves settings and refreshes rule parsing without triggering automatic file reorganization.
     * Use this when you want to persist settings changes but don't want files to be moved immediately.
     */
    async saveSettingsWithoutReorganizing() {
        await this.persistSettingsAndRefreshRules();
    }

    /**
     * Saves settings, refreshes rule parsing, and triggers reorganization of all markdown files.
     * This is the recommended method when rule changes should be applied immediately to existing files.
     */
    async saveSettingsAndRefreshRules() {
        await this.persistSettingsAndRefreshRules();
        await this.reorganizeAllMarkdownFiles();
    }

    /**
     * Retrieves the parsing/deserialization error for a specific rule by its index.
     *
     * @param index - The zero-based index of the rule in the settings
     * @returns The error object if the rule at this index failed to parse, undefined otherwise
     */
    getRuleErrorForIndex(index: number): FrontmatterRuleDeserializationError | undefined {
        return this.ruleParseErrors.find(error => error.index === index);
    }

    private async recordMove(fromPath: string, toPath: string, fileName: string, ruleKey: string, skipSave = false): Promise<void> {
        if (!fromPath || !toPath || !fileName) {
            throw new Error('Invalid move parameters: fromPath, toPath, and fileName are required');
        }

        const entry: MoveHistoryEntry = {
            timestamp: Date.now(),
            fileName,
            fromPath,
            toPath,
            ruleKey,
        };

        this.settings.moveHistory.unshift(entry);

        // Trim history to max size
        if (this.settings.moveHistory.length > this.settings.maxHistorySize) {
            this.settings.moveHistory = this.settings.moveHistory.slice(0, this.settings.maxHistorySize);
        }

        if (!skipSave) {
            await this.saveSettings();
        }
    }

    async undoLastMove(): Promise<void> {
        if (this.settings.moveHistory.length === 0) {
            new Notice('No moves to undo.');
            return;
        }

        const lastMove = this.settings.moveHistory[0];
        const currentFile = this.app.vault.getAbstractFileByPath(lastMove.toPath);

        if (!currentFile) {
            new Notice(`Cannot undo: File no longer exists at ${lastMove.toPath}`);
            // Remove from history since file doesn't exist
            this.settings.moveHistory.shift();
            await this.saveSettings();
            return;
        }

        if (!(currentFile instanceof TFile)) {
            new Notice(`Cannot undo: ${lastMove.toPath} is not a file.`);
            this.settings.moveHistory.shift();
            await this.saveSettings();
            return;
        }

        // Check if destination already exists
        const destinationExists = this.app.vault.getAbstractFileByPath(lastMove.fromPath);
        if (destinationExists) {
            new Notice(`Cannot undo: A file already exists at ${lastMove.fromPath}`);
            // Remove from history to be consistent with missing file case
            this.settings.moveHistory.shift();
            await this.saveSettings();
            return;
        }

        try {
            // Extract folder path from the original location
            const lastSlashIndex = lastMove.fromPath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
                const folderPath = lastMove.fromPath.substring(0, lastSlashIndex);
                await this.ensureFolderExists(folderPath);
            }

            // Perform the undo (move back to original location)
            await this.app.fileManager.renameFile(currentFile, lastMove.fromPath);

            // Remove from history
            this.settings.moveHistory.shift();
            await this.saveSettings();

            new Notice(`Undone: Moved ${lastMove.fileName} back to ${lastMove.fromPath}`);
        } catch (err) {
            const categorized = categorizeError(err, lastMove.toPath, 'move', lastMove.fromPath);
            new Notice(categorized.getUserMessage());
            console.error('[Vault Organizer] Undo failed:', err);
        }
    }

    private async ensureFolderExists(folderPath: string): Promise<void> {
        if (!folderPath || folderPath === '.' || folderPath === '/') {
            return;
        }

        // Validate the folder path before attempting to create it
        const validation = validatePath(folderPath, {
            allowEmpty: false,
            allowAbsolute: false,
        });

        if (!validation.valid || !validation.sanitizedPath) {
            throw validation.error || new Error('Path validation failed');
        }

        const sanitizedPath = validation.sanitizedPath;
        const segments = sanitizedPath.split('/').filter(Boolean);
        if (!segments.length) {
            return;
        }

        let currentPath = '';
        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const existing = this.app.vault.getAbstractFileByPath(currentPath);

            if (existing) {
                // Check if it's a file - we can't create a folder with the same name as a file
                if (existing instanceof TFile) {
                    throw new FileConflictError(
                        currentPath,
                        undefined,
                        'exists',
                        'create-folder'
                    );
                }
                // It's a folder, already exists - continue
                continue;
            }

            try {
                await this.app.vault.createFolder(currentPath);
            } catch (err) {
                // Categorize the error for better user feedback
                const categorized = categorizeError(err, currentPath, 'create-folder');
                throw categorized;
            }
        }
    }

    private async applyRulesToFile(file: TFile, skipSave = false): Promise<void> {
        let intendedDestination: string | undefined;
        try {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!frontmatter) {
                return;
            }

            const rule = matchFrontmatter.call(this, file, this.rules, frontmatter);
            if (!rule) {
                return;
            }

            const trimmedDestination = rule.destination.trim();
            if (!trimmedDestination) {
                if (rule.debug) {
                    const vaultName = this.app.vault.getName();
                    new Notice(`DEBUG: ${file.basename} would not be moved because destination is empty in ${vaultName}.`);
                }
                return;
            }

            // Validate the destination path before attempting to move
            const destinationValidation = validateDestinationPath(trimmedDestination);
            if (!destinationValidation.valid || !destinationValidation.sanitizedPath) {
                throw destinationValidation.error || new Error('Destination path validation failed');
            }

            const destinationFolder = destinationValidation.sanitizedPath;

            // Validate the full destination path (folder + filename)
            const fullPathValidation = validatePath(`${destinationFolder}/${file.name}`, {
                allowEmpty: false,
                allowAbsolute: false,
            });

            if (!fullPathValidation.valid || !fullPathValidation.sanitizedPath) {
                throw fullPathValidation.error || new Error('Full path validation failed');
            }

            const newPath = fullPathValidation.sanitizedPath;
            intendedDestination = newPath;

            if (file.path === newPath) {
                return;
            }

            if (rule.debug) {
                const vaultName = this.app.vault.getName();
                new Notice(`DEBUG: ${file.basename} would be moved to ${vaultName}/${destinationFolder}`);
                return;
            }

            await this.ensureFolderExists(destinationFolder);

            const oldPath = file.path;
            try {
                await this.app.fileManager.renameFile(file, newPath);
                // Record successful move in history
                await this.recordMove(oldPath, newPath, file.name, rule.key, skipSave);
            } catch (err) {
                // Categorize the rename error for better user feedback
                const categorized = categorizeError(err, file.path, 'move', newPath);
                throw categorized;
            }
        } catch (err) {
            // Handle categorized errors with user-friendly messages
            if (err instanceof VaultOrganizerError) {
                new Notice(err.getUserMessage());
                console.error(`[Vault Organizer] ${err.name}:`, err.message, err);
            } else {
                // Fallback for unexpected errors
                const categorized = categorizeError(err, file.path, 'move', intendedDestination);
                new Notice(categorized.getUserMessage());
                console.error('[Vault Organizer] Unexpected error:', err);
            }
        }
    }

    private async reorganizeAllMarkdownFiles(): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles?.();
        if (!markdownFiles?.length) {
            return;
        }

        // Use batch mode to avoid saving settings on every move
        for (const file of markdownFiles) {
            await this.applyRulesToFile(file, true);
        }

        // Save settings once at the end
        await this.saveSettings();
    }

    /**
     * Tests all enabled rules against all markdown files in the vault without executing moves.
     * Useful for previewing what changes would be made by the current rule configuration.
     *
     * @returns An array of test results containing file paths, matching rules, and intended destinations,
     *          including any validation errors that would prevent the move
     */
    testAllRules(): RuleTestResult[] {
        const markdownFiles = this.app.vault.getMarkdownFiles?.() || [];
        const results: RuleTestResult[] = [];

        for (const file of markdownFiles) {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!frontmatter) {
                continue;
            }

            const ruleIndex = this.rules.findIndex(rule => {
                if (rule.enabled === false) {
                    return false;
                }
                return matchFrontmatter.call(this, file, [rule], frontmatter);
            });

            if (ruleIndex === -1) {
                continue;
            }

            const rule = this.rules[ruleIndex];
            const trimmedDestination = rule.destination.trim();
            if (!trimmedDestination) {
                continue;
            }

            const destinationValidation = validateDestinationPath(trimmedDestination);
            if (!destinationValidation.valid) {
                results.push({
                    file,
                    currentPath: file.path,
                    ruleIndex,
                    error: destinationValidation.error,
                    warnings: destinationValidation.warnings,
                });
                continue;
            }

            const sanitizedDestination = destinationValidation.sanitizedPath ?? '';
            const combinedPath = sanitizedDestination ? `${sanitizedDestination}/${file.name}` : file.name;
            const newPathValidation = validatePath(combinedPath, {
                allowEmpty: false,
                allowAbsolute: false,
                checkReservedNames: true,
            });

            if (!newPathValidation.valid || !newPathValidation.sanitizedPath) {
                const warnings = [
                    ...(destinationValidation.warnings ?? []),
                    ...(newPathValidation.warnings ?? []),
                ];
                results.push({
                    file,
                    currentPath: file.path,
                    ruleIndex,
                    error: newPathValidation.error,
                    warnings: warnings.length ? warnings : undefined,
                });
                continue;
            }

            const sanitizedNewPath = newPathValidation.sanitizedPath;
            if (file.path !== sanitizedNewPath) {
                const warnings = [
                    ...(destinationValidation.warnings ?? []),
                    ...(newPathValidation.warnings ?? []),
                ];
                results.push({
                    file,
                    currentPath: file.path,
                    newPath: sanitizedNewPath,
                    ruleIndex,
                    warnings: warnings.length ? warnings : undefined,
                });
            }
        }

        return results;
    }
}

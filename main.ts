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
    InvalidPathError,
    categorizeError,
} from './src/errors';
import {
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
import { COMMANDS, NOTICES } from './src/constants';
import { isExcluded } from './src/exclusionPatterns';
import { Logger } from './src/logger';
import { PERFORMANCE_CONFIG } from './src/config';
import { validateAndPrepareDestination } from './src/pathValidationHelper';

export default class VaultOrganizer extends Plugin {
    settings!: VaultOrganizerSettings;
    private rules: FrontmatterRule[] = [];
    private ruleParseErrors: FrontmatterRuleDeserializationError[] = [];
    private ruleSettingTab?: RuleSettingTab;
    private batchOperationInProgress = false;
    // Race condition protection: track files currently being processed
    private filesBeingProcessed = new Set<string>();

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

        /**
         * Event Handler Strategy:
         *
         * This plugin uses a unified event handling approach to automatically organize files
         * based on frontmatter rules. The strategy balances responsiveness with performance:
         *
         * 1. UNIFIED HANDLER: A single handler function is reused across multiple events
         *    to maintain consistency and reduce code duplication.
         *
         * 2. EVENTS MONITORED:
         *    - vault.on('create'): Triggered when new files are created
         *    - vault.on('modify'): Triggered when file content changes
         *    - vault.on('rename'): Triggered when files are renamed/moved
         *    - metadataCache.on('changed'): Triggered when frontmatter metadata changes
         *
         * 3. WHY MULTIPLE EVENTS:
         *    - 'create': Ensures newly created files are immediately organized
         *    - 'modify': Catches frontmatter changes made by direct editing
         *    - 'rename': Detects manual moves or renames (we still recheck rules)
         *    - 'changed': Specifically tracks metadata updates, most reliable for frontmatter
         *
         * 4. DEDUPLICATION: While multiple events may fire for a single user action,
         *    applyRulesToFile() includes guards to prevent redundant moves:
         *    - Checks if destination matches current location
         *    - Only moves if file is NOT already at the correct location
         *
         * 5. PERFORMANCE CONSIDERATIONS:
         *    - Early return for non-markdown files (line filter)
         *    - File extension check (extension !== 'md') before processing
         *    - Metadata existence check before rule matching
         *    - Debouncing in settings UI prevents excessive saves
         *
         * 6. ERROR HANDLING: Each invocation is wrapped in try-catch within
         *    applyRulesToFile() to prevent one file's error from blocking others
         *
         * 7. BATCH MODE: For bulk operations (reorganizeAllMarkdownFiles), we use
         *    skipSave parameter to defer settings persistence until all files are processed
         */
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
            name: COMMANDS.REORGANIZE.name,
            callback: async () => {
                await this.reorganizeAllMarkdownFiles();
            },
        });

        this.addCommand({
            id: 'obsidian-vault-organizer-undo-last-move',
            name: COMMANDS.UNDO.name,
            callback: async () => {
                await this.undoLastMove();
            },
        });

        this.addCommand({
            id: 'obsidian-vault-organizer-view-history',
            name: COMMANDS.VIEW_HISTORY.name,
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
            excludePatterns: Array.isArray(loaded?.excludePatterns) ? loaded.excludePatterns : [],
        };
    }

    /**
     * Persists current plugin settings to storage.
     * When called during a batch operation, saves are deferred until the batch completes.
     */
    async saveSettings() {
        this.settings.rules = this.settings.rules.map(normalizeSerializedRule);

        // Skip save if we're in a batch operation - it will be saved at the end
        if (this.batchOperationInProgress) {
            return;
        }

        await this.saveData(this.settings);
    }

    /**
     * Batch Operation Pattern for Settings Persistence
     *
     * This method provides a formal batch operation pattern to optimize performance
     * when multiple operations would normally trigger individual settings saves.
     *
     * BENEFITS:
     * - Reduces I/O operations by consolidating multiple saves into one
     * - Improves performance for bulk operations (e.g., reorganizing 1000+ files)
     * - Maintains data consistency by ensuring settings are saved even if errors occur
     * - Simplifies code by abstracting the batch operation logic
     *
     * USAGE PATTERN:
     * ```typescript
     * await this.withBatchOperation(async () => {
     *     // Multiple operations that would normally save settings
     *     await this.applyRulesToFile(file1, true);
     *     await this.applyRulesToFile(file2, true);
     *     await this.applyRulesToFile(file3, true);
     *     // ... hundreds more files
     * });
     * // Settings are saved once here, after all operations complete
     * ```
     *
     * IMPLEMENTATION DETAILS:
     * - Sets batchOperationInProgress flag to defer saveSettings() calls
     * - Executes the provided operation function
     * - Guarantees settings save in finally block (even if operation throws)
     * - Prevents nested batch operations (logs warning if attempted)
     *
     * ERROR HANDLING:
     * - Settings are always saved, even if the batch operation throws an error
     * - Errors from the operation are re-thrown after settings are saved
     * - This ensures no data loss while maintaining error propagation
     *
     * @param operation - Async function containing the batched operations
     * @returns Promise resolving to the operation's return value
     * @throws Re-throws any error from the operation after ensuring settings are saved
     *
     * @example
     * // Reorganize all files with a single settings save
     * await this.withBatchOperation(async () => {
     *     for (const file of markdownFiles) {
     *         await this.applyRulesToFile(file, true);
     *     }
     * });
     *
     * @example
     * // Batch multiple rule changes
     * await this.withBatchOperation(async () => {
     *     this.settings.rules.push(newRule1);
     *     this.settings.rules.push(newRule2);
     *     this.updateRulesFromSettings();
     * });
     */
    async withBatchOperation<T>(operation: () => Promise<T>): Promise<T> {
        // Prevent nested batch operations
        if (this.batchOperationInProgress) {
            Logger.warn('Nested batch operations are not supported. Using existing batch context.');
            return await operation();
        }

        this.batchOperationInProgress = true;
        try {
            const result = await operation();
            return result;
        } finally {
            // Always save settings and reset flag, even if operation threw an error
            this.batchOperationInProgress = false;
            await this.saveData(this.settings);
        }
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
                const noticeMessage = NOTICES.REGEX_PARSE_ERROR(ruleKey, error.message);
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
            throw new InvalidPathError(
                fromPath || toPath || '(empty)',
                'empty',
                'fromPath, toPath, and fileName are required for recording move history'
            );
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
            new Notice(NOTICES.UNDO.NO_MOVES);
            return;
        }

        const lastMove = this.settings.moveHistory[0];
        const currentFile = this.app.vault.getAbstractFileByPath(lastMove.toPath);

        if (!currentFile) {
            new Notice(NOTICES.UNDO.FILE_NOT_EXISTS(lastMove.toPath));
            // Remove from history since file doesn't exist
            this.settings.moveHistory.shift();
            await this.saveSettings();
            return;
        }

        if (!(currentFile instanceof TFile)) {
            new Notice(NOTICES.UNDO.NOT_A_FILE(lastMove.toPath));
            this.settings.moveHistory.shift();
            await this.saveSettings();
            return;
        }

        // Check if destination already exists
        const destinationExists = this.app.vault.getAbstractFileByPath(lastMove.fromPath);
        if (destinationExists) {
            new Notice(NOTICES.UNDO.DESTINATION_EXISTS(lastMove.fromPath));
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

            new Notice(NOTICES.UNDO.SUCCESS(lastMove.fileName, lastMove.fromPath));
        } catch (err) {
            const categorized = categorizeError(err, lastMove.toPath, 'move', lastMove.fromPath);
            new Notice(categorized.getUserMessage());
            // Log as warning since undo failures are expected in some scenarios (e.g., file conflicts)
            Logger.warn('Undo operation failed', err);
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
            throw validation.error || new InvalidPathError(folderPath, 'invalid-characters', 'Path validation failed');
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

    /**
     * Generates a unique filename when a conflict occurs.
     *
     * @param basePath - The base path without extension
     * @param extension - The file extension
     * @param strategy - The conflict resolution strategy
     * @returns A unique file path
     * @throws {FileConflictError} If unable to generate a unique filename after max attempts
     */
    private generateUniqueFilename(basePath: string, extension: string, strategy: 'append-number' | 'append-timestamp'): string {
        if (strategy === 'append-timestamp') {
            const timestamp = Date.now();
            return `${basePath}-${timestamp}${extension}`;
        }

        // append-number strategy with infinite loop protection
        let counter = 1;
        let newPath = `${basePath}-${counter}${extension}`;

        while (this.app.vault.getAbstractFileByPath(newPath)) {
            counter++;

            // CRITICAL: Prevent infinite loop by capping attempts
            if (counter > PERFORMANCE_CONFIG.MAX_UNIQUE_FILENAME_ATTEMPTS) {
                throw new FileConflictError(
                    `${basePath}${extension}`,
                    undefined,
                    'max-attempts',
                    'generate-unique-filename'
                );
            }

            newPath = `${basePath}-${counter}${extension}`;
        }

        return newPath;
    }

    private async applyRulesToFile(file: TFile, skipSave = false): Promise<void> {
        // CRITICAL: Race condition protection - prevent concurrent processing of the same file
        // Multiple events (create, modify, rename, metadata-changed) can fire for a single file change
        // Store original path to handle file renames during processing
        const originalPath = file.path;

        if (this.filesBeingProcessed.has(originalPath)) {
            return;
        }

        this.filesBeingProcessed.add(originalPath);
        let intendedDestination: string | undefined;
        try {
            // Check if file is excluded
            if (isExcluded(file.path, this.settings.excludePatterns)) {
                return;
            }

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
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
                    new Notice(NOTICES.DEBUG.EMPTY_DESTINATION(file.basename, vaultName));
                }
                return;
            }

            // Validate and prepare destination using shared helper
            const validation = validateAndPrepareDestination(trimmedDestination, file.name, frontmatter);

            if (!validation.valid || !validation.fullPath || !validation.destinationFolder) {
                throw validation.error ?? new InvalidPathError(
                    trimmedDestination,
                    'invalid-characters',
                    'Destination validation failed'
                );
            }

            // Warn about missing variables in debug mode
            if (rule.debug && validation.substitution && validation.substitution.missing.length > 0) {
                new Notice(`DEBUG: Missing variables in destination: ${validation.substitution.missing.join(', ')}`);
            }

            let newPath = validation.fullPath;
            const destinationFolder = validation.destinationFolder;
            intendedDestination = newPath;

            if (file.path === newPath) {
                return;
            }

            if (rule.debug) {
                const vaultName = this.app.vault.getName();
                new Notice(NOTICES.DEBUG.WOULD_MOVE(file.basename, vaultName, destinationFolder));
                return;
            }

            await this.ensureFolderExists(destinationFolder);

            // Handle conflict resolution
            const existingFile = this.app.vault.getAbstractFileByPath(newPath);
            if (existingFile) {
                const conflictStrategy = rule.conflictResolution ?? 'fail';

                if (conflictStrategy === 'skip') {
                    // Silently skip the move
                    return;
                } else if (conflictStrategy === 'append-number' || conflictStrategy === 'append-timestamp') {
                    // Generate a unique filename
                    const dotIndex = file.name.lastIndexOf('.');
                    const baseName = dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
                    const extension = dotIndex > 0 ? file.name.substring(dotIndex) : '';
                    const basePathWithoutExt = `${destinationFolder}/${baseName}`;

                    newPath = this.generateUniqueFilename(basePathWithoutExt, extension, conflictStrategy);
                    intendedDestination = newPath;
                } else {
                    // Default 'fail' - throw an error
                    throw new FileConflictError(newPath, file.path, 'exists', 'move');
                }
            }

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
                // Log expected errors at warn level (e.g., validation failures, conflicts)
                Logger.warn(`Expected error - ${err.name}`, err.message);
            } else {
                // Fallback for unexpected errors - log at error level for investigation
                const categorized = categorizeError(err, file.path, 'move', intendedDestination);
                new Notice(categorized.getUserMessage());
                Logger.error('Unexpected error during file processing', err);
            }
        } finally {
            // CRITICAL: Always remove file from processing set using original path
            // This prevents issues if the file was renamed during processing
            this.filesBeingProcessed.delete(originalPath);
        }
    }

    /**
     * Reorganizes all markdown files in the vault according to configured rules.
     * Uses batch operation pattern to optimize performance by deferring settings
     * persistence until all files have been processed.
     *
     * PERFORMANCE: For large vaults (1000+ files), this reduces settings saves
     * from potentially thousands down to a single save operation. Also includes
     * rate limiting to prevent UI blocking.
     */
    private async reorganizeAllMarkdownFiles(): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles?.();
        if (!markdownFiles?.length) {
            return;
        }

        // Use batch operation pattern to save settings only once at the end
        await this.withBatchOperation(async () => {
            for (let i = 0; i < markdownFiles.length; i++) {
                const file = markdownFiles[i];
                // skipSave parameter is now redundant due to batch operation,
                // but kept for backward compatibility
                await this.applyRulesToFile(file, true);

                // Rate limiting: yield to event loop periodically to keep UI responsive
                if ((i + 1) % PERFORMANCE_CONFIG.BULK_OPERATION_BATCH_SIZE === 0) {
                    await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.BULK_OPERATION_BATCH_DELAY_MS));
                }
            }
        });
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
            // Skip excluded files
            if (isExcluded(file.path, this.settings.excludePatterns)) {
                continue;
            }

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
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

            // Validate and prepare destination using shared helper
            const validation = validateAndPrepareDestination(trimmedDestination, file.name, frontmatter);

            if (!validation.valid || !validation.fullPath) {
                results.push({
                    file,
                    currentPath: file.path,
                    ruleIndex,
                    error: validation.error ?? new InvalidPathError(trimmedDestination, 'invalid-characters', 'Unknown validation error'),
                    warnings: validation.warnings?.length ? validation.warnings : undefined,
                });
                continue;
            }

            const sanitizedNewPath = validation.fullPath;
            if (file.path !== sanitizedNewPath) {
                results.push({
                    file,
                    currentPath: file.path,
                    newPath: sanitizedNewPath,
                    ruleIndex,
                    warnings: validation.warnings?.length ? validation.warnings : undefined,
                });
            }
        }

        return results;
    }
}

import {
    App,
    FuzzySuggestModal,
    Modal,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    debounce,
    getAllTags,
    Notice,
} from 'obsidian';
import type { TextComponent } from 'obsidian';
import {
    FrontmatterRule,
    FrontmatterMatchType,
    SerializedFrontmatterRule,
    deserializeFrontmatterRules,
    FrontmatterRuleDeserializationError,
    matchFrontmatter,
    serializeFrontmatterRules,
    requiresValue,
    hasValidValue,
} from './src/rules';
import {
    InvalidPathError,
    VaultOrganizerError,
    categorizeError,
} from './src/errors';
import {
    validateDestinationPath,
    validatePath,
} from './src/pathSanitization';

interface VaultOrganizerSettings {
    rules: SerializedFrontmatterRule[];
}

const DEFAULT_SETTINGS: VaultOrganizerSettings = {
    rules: [],
};

type RuleTestResult = {
    file: TFile;
    currentPath: string;
    ruleIndex: number;
    newPath?: string;
    warnings?: string[];
    error?: InvalidPathError;
};

const MATCH_TYPE_OPTIONS: { value: FrontmatterMatchType; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts-with', label: 'Starts with' },
    { value: 'ends-with', label: 'Ends with' },
    { value: 'regex', label: 'Regular expression' },
];

function normalizeSerializedRule(rule: SerializedFrontmatterRule): SerializedFrontmatterRule {
    const matchType: FrontmatterMatchType = rule.matchType ?? (rule.isRegex ? 'regex' : 'equals');
    const normalized: SerializedFrontmatterRule = {
        ...rule,
        matchType,
        key: rule.key ?? '',
        value: rule.value ?? '',
        destination: rule.destination ?? '',
        enabled: rule.enabled ?? false,
    };
    if (matchType === 'regex') {
        normalized.isRegex = true;
        normalized.flags = rule.flags ?? '';
    } else {
        delete normalized.isRegex;
        if ('flags' in normalized) {
            delete normalized.flags;
        }
    }
    return normalized;
}

export default class VaultOrganizer extends Plugin {
    settings: VaultOrganizerSettings;
    private rules: FrontmatterRule[] = [];
    private ruleParseErrors: FrontmatterRuleDeserializationError[] = [];
    private ruleSettingTab?: RuleSettingTab;

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

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.ruleSettingTab = new RuleSettingTab(this.app, this);
        this.addSettingTab(this.ruleSettingTab);
    }

    onunload() {

    }

    async loadSettings() {
        const loaded = await this.loadData();
        const rules = Array.isArray(loaded?.rules)
            ? loaded.rules.map(normalizeSerializedRule)
            : [];
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loaded,
            rules,
        };
    }

    async saveSettings() {
        const normalizedRules = this.settings.rules.map(normalizeSerializedRule);
        this.settings.rules = normalizedRules;
        await this.saveData({ ...this.settings, rules: normalizedRules });
    }

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

    async saveSettingsWithoutReorganizing() {
        await this.persistSettingsAndRefreshRules();
    }

    async saveSettingsAndRefreshRules() {
        await this.persistSettingsAndRefreshRules();
        await this.reorganizeAllMarkdownFiles();
    }

    getRuleErrorForIndex(index: number): FrontmatterRuleDeserializationError | undefined {
        return this.ruleParseErrors.find(error => error.index === index);
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

        if (!validation.valid) {
            throw validation.error;
        }

        const sanitizedPath = validation.sanitizedPath!;
        const segments = sanitizedPath.split('/').filter(Boolean);
        if (!segments.length) {
            return;
        }

        let currentPath = '';
        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            if (this.app.vault.getAbstractFileByPath(currentPath)) {
                continue;
            }

            try {
                await this.app.vault.createFolder(currentPath);
            } catch (err) {
                // Categorize the error for better user feedback
                const categorized = categorizeError(err, currentPath);
                throw categorized;
            }
        }
    }

    private async applyRulesToFile(file: TFile): Promise<void> {
        const noteName = file.basename;
        let intendedDestination: string | undefined;
        try {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!frontmatter) {
                return;
            }

            const rule = matchFrontmatter.call(this, file, this.rules);
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
            if (!destinationValidation.valid) {
                throw destinationValidation.error;
            }

            const destinationFolder = destinationValidation.sanitizedPath!;

            // Validate the full destination path (folder + filename)
            const fullPathValidation = validatePath(`${destinationFolder}/${file.name}`, {
                allowEmpty: false,
                allowAbsolute: false,
            });

            if (!fullPathValidation.valid) {
                throw fullPathValidation.error;
            }

            const newPath = fullPathValidation.sanitizedPath!;
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

            try {
                await this.app.fileManager.renameFile(file, newPath);
            } catch (err) {
                // Categorize the rename error for better user feedback
                const categorized = categorizeError(err, file.path, newPath);
                throw categorized;
            }
        } catch (err) {
            // Handle categorized errors with user-friendly messages
            if (err instanceof VaultOrganizerError) {
                new Notice(err.getUserMessage());
                console.error(`[Vault Organizer] ${err.name}:`, err.message, err);
            } else {
                // Fallback for unexpected errors
                const categorized = categorizeError(err, file.path, intendedDestination);
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

        for (const file of markdownFiles) {
            await this.applyRulesToFile(file);
        }
    }

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
                return matchFrontmatter.call(this, file, [rule]);
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

            if (!newPathValidation.valid) {
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

            const sanitizedNewPath = newPathValidation.sanitizedPath!;
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

class RuleSettingTab extends PluginSettingTab {
    plugin: VaultOrganizer;
    private debouncedSaveOnly: ReturnType<typeof debounce>;
    private aggregatedTags: string[] = [];
    private frontmatterKeys: string[] = [];

    constructor(app: App, plugin: VaultOrganizer) {
        super(app, plugin);
        this.plugin = plugin;
        this.debouncedSaveOnly = debounce(async () => {
            await this.plugin.saveSettingsWithoutReorganizing();
        }, 300);
        this.refreshAggregatedTags();
        this.refreshFrontmatterKeys();
        this.plugin.registerEvent(this.plugin.app.metadataCache.on('resolved', () => {
            this.refreshAggregatedTags();
            this.refreshFrontmatterKeys();
        }));
    }

    private scheduleSaveOnly() {
        this.debouncedSaveOnly();
    }

    private cancelPendingSaveOnly() {
        this.debouncedSaveOnly.cancel();
    }

    private refreshAggregatedTags() {
        const tagSet = new Set<string>();
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles?.() ?? [];
        markdownFiles.forEach(file => {
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            if (!cache) {
                return;
            }
            const tags = getAllTags(cache);
            if (!tags) {
                return;
            }
            tags.forEach(tag => tagSet.add(tag));
        });
        this.aggregatedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    }

    private getAggregatedTags(): string[] {
        if (!this.aggregatedTags.length) {
            this.refreshAggregatedTags();
        }
        return this.aggregatedTags;
    }

    private refreshFrontmatterKeys() {
        const keySet = new Set<string>();
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles?.() ?? [];
        markdownFiles.forEach(file => {
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) {
                return;
            }
            Object.keys(frontmatter)
                .filter(key => key !== 'position')
                .forEach(key => keySet.add(key));
        });
        this.frontmatterKeys = Array.from(keySet).sort((a, b) => a.localeCompare(b));
    }

    private getFrontmatterKeys(): string[] {
        if (!this.frontmatterKeys.length) {
            this.refreshFrontmatterKeys();
        }
        return this.frontmatterKeys;
    }

    private openTagPicker(tags: string[], onSelect: (tag: string) => void) {
        if (!tags.length) {
            return;
        }
        const modal = new RuleTagPickerModal(this.app, tags, onSelect);
        modal.open();
    }

    private openFrontmatterKeyPicker(keys: string[], onSelect: (key: string) => void) {
        if (!keys.length) {
            return;
        }
        const modal = new RuleFrontmatterKeyPickerModal(this.app, keys, onSelect);
        modal.open();
    }

    private toggleTagValue(currentValue: string, tag: string): string {
        const values = currentValue.split(/\s+/).filter(Boolean);
        const hasTag = values.includes(tag);
        const nextValues = hasTag ? values.filter(value => value !== tag) : [...values, tag];
        return nextValues.join(' ');
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        this.refreshAggregatedTags();
        this.refreshFrontmatterKeys();
        this.plugin.settings.rules = this.plugin.settings.rules.map(normalizeSerializedRule);

        this.plugin.settings.rules.forEach((rule, index) => {
            const currentMatchType: FrontmatterMatchType = rule.matchType ?? 'equals';
            const setting = new Setting(containerEl)
                .setName(`Rule ${index + 1}`)
                .setDesc('Destination folder is required before the rule can move files.');
            setting.settingEl.classList.add('setting-item');
            const warningEl = document.createElement('div');
            warningEl.classList.add('vault-organizer-rule-warning');
            warningEl.style.display = 'none';
            setting.settingEl.appendChild(warningEl);

            const updateEnabledState = () => {
                const currentRule = this.plugin.settings.rules[index];
                const isEnabled = currentRule?.enabled ?? false;
                setting.settingEl.classList.toggle('vault-organizer-rule-disabled', !isEnabled);
            };

            setting.addToggle(toggle =>
                toggle
                    .setTooltip('Activate this rule')
                    .setValue(rule.enabled ?? false)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.enabled = value;
                        updateEnabledState();
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                        updateEnabledState();
                    }));

            // Add up arrow button
            setting.addExtraButton(button =>
                button
                    .setIcon('arrow-up')
                    .setTooltip('Move rule up')
                    .setDisabled(index === 0)
                    .onClick(async () => {
                        if (index === 0) return;
                        // Swap with previous rule
                        const temp = this.plugin.settings.rules[index];
                        this.plugin.settings.rules[index] = this.plugin.settings.rules[index - 1];
                        this.plugin.settings.rules[index - 1] = temp;
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        this.display();
                    }));

            // Add down arrow button
            setting.addExtraButton(button =>
                button
                    .setIcon('arrow-down')
                    .setTooltip('Move rule down')
                    .setDisabled(index === this.plugin.settings.rules.length - 1)
                    .onClick(async () => {
                        if (index === this.plugin.settings.rules.length - 1) return;
                        // Swap with next rule
                        const temp = this.plugin.settings.rules[index];
                        this.plugin.settings.rules[index] = this.plugin.settings.rules[index + 1];
                        this.plugin.settings.rules[index + 1] = temp;
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        this.display();
                    }));

            const refreshWarning = () => {
                const error = this.plugin.getRuleErrorForIndex(index);
                const currentRule = this.plugin.settings.rules[index];
                const matchType = currentRule?.matchType ?? 'equals';
                const ruleRequiresValue = requiresValue(matchType);
                const hasValue = currentRule ? hasValidValue(currentRule) : false;

                if (error) {
                    setting.settingEl.classList.add('vault-organizer-rule-error');
                    warningEl.textContent = `Invalid regular expression: ${error.message}`;
                    warningEl.style.display = '';
                } else if (ruleRequiresValue && !hasValue) {
                    setting.settingEl.classList.add('vault-organizer-rule-error');
                    warningEl.textContent = 'Value is required for contains/starts-with/ends-with rules.';
                    warningEl.style.display = '';
                } else {
                    setting.settingEl.classList.remove('vault-organizer-rule-error');
                    warningEl.textContent = '';
                    warningEl.style.display = 'none';
                }
            };

            let keyTextComponent: TextComponent | undefined;
            setting.addText(text => {
                keyTextComponent = text;
                text
                    .setPlaceholder('key')
                    .setValue(rule.key)
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.key = value;
                        this.scheduleSaveOnly();
                    });
            });
            setting.addExtraButton(button =>
                button
                    .setIcon('list')
                    .setTooltip('Browse frontmatter keys')
                    .onClick(() => {
                        const keys = this.getFrontmatterKeys();
                        this.openFrontmatterKeyPicker(keys, (key) => {
                            const currentRule = this.plugin.settings.rules[index];
                            if (!currentRule || !keyTextComponent) {
                                return;
                            }
                            keyTextComponent.setValue(key);
                            currentRule.key = key;
                            this.scheduleSaveOnly();
                        });
                    }));
            let valueTextComponent: TextComponent | undefined;
            setting.addText(text => {
                valueTextComponent = text;
                text
                    .setPlaceholder('value')
                    .setValue(rule.value)
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.value = value;
                        this.scheduleSaveOnly();
                        refreshWarning();
                    });
            });
            setting.addExtraButton(button =>
                button
                    .setIcon('hashtag')
                    .setTooltip('Browse tags')
                    .onClick(() => {
                        const tags = this.getAggregatedTags();
                        this.openTagPicker(tags, (tag) => {
                            const currentRule = this.plugin.settings.rules[index];
                            if (!currentRule || !valueTextComponent) {
                                return;
                            }
                            const nextValue = this.toggleTagValue(valueTextComponent.getValue(), tag);
                            valueTextComponent.setValue(nextValue);
                            currentRule.value = nextValue;
                            this.scheduleSaveOnly();
                        });
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('destination folder (required)')
                    .setValue(rule.destination)
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.destination = value;
                        this.scheduleSaveOnly();
                    }));
            let flagsTextComponent: TextComponent | undefined;
            let caseInsensitiveToggleComponent: any;
            const updateRegexControlsVisibility = () => {
                const currentRule = this.plugin.settings.rules[index];
                const isRegex = (currentRule?.matchType ?? 'equals') === 'regex';
                if (flagsTextComponent) {
                    flagsTextComponent.inputEl.toggleAttribute('disabled', !isRegex);
                    flagsTextComponent.inputEl.disabled = !isRegex;
                    flagsTextComponent.inputEl.style.display = isRegex ? '' : 'none';
                }
                if (caseInsensitiveToggleComponent) {
                    caseInsensitiveToggleComponent.toggleEl.style.display = isRegex ? 'none' : '';
                }
            };
            setting.addDropdown(dropdown => {
                dropdown.selectEl.setAttribute('aria-label', 'Match type');
                MATCH_TYPE_OPTIONS.forEach(option => dropdown.addOption(option.value, option.label));
                dropdown
                    .setValue(currentMatchType)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.matchType = value as FrontmatterMatchType;
                        if (value === 'regex') {
                            currentRule.isRegex = true;
                            currentRule.flags = currentRule.flags ?? '';
                        } else {
                            delete currentRule.isRegex;
                            if ('flags' in currentRule) {
                                delete currentRule.flags;
                            }
                        }
                        updateRegexControlsVisibility();
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                        updateRegexControlsVisibility();
                        refreshWarning();
                    });
            });
            setting.addText(text => {
                flagsTextComponent = text;
                text
                    .setPlaceholder('flags')
                    .setValue(rule.flags ?? '')
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        if (currentRule.matchType === 'regex') {
                            currentRule.flags = value;
                            this.scheduleSaveOnly();
                        }
                    });
            });
            updateRegexControlsVisibility();

            setting.addToggle(toggle => {
                caseInsensitiveToggleComponent = toggle;
                toggle
                    .setTooltip('Case insensitive matching')
                    .setValue(rule.caseInsensitive ?? false)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.caseInsensitive = value;
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                    });
            });

            setting.addToggle(toggle =>
                toggle
                    .setTooltip('Enable debug mode')
                    .setValue(rule.debug ?? false)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.debug = value;
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addButton(btn =>
                btn
                    .setButtonText('Remove')
                    .onClick(async () => {
                        this.plugin.settings.rules.splice(index, 1);
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        this.display();
                    }));

            refreshWarning();
            updateEnabledState();
        });

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText('Add Rule')
                    .onClick(async () => {
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', matchType: 'equals', debug: false, enabled: false });
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        this.display();
                    }));

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText('Apply now')
                    .onClick(async () => {
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                    }))
            .addButton(btn =>
                btn
                    .setButtonText('Test All Rules')
                    .setTooltip('Preview what moves would be made without actually moving files')
                    .onClick(async () => {
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        const results = this.plugin.testAllRules();
                        new TestAllRulesModal(this.app, results, this.plugin.settings.rules).open();
                    }));
    }

    refreshWarnings() {
        const { containerEl } = this;
        if (!containerEl) {
            return;
        }
        const settingElements = containerEl.querySelectorAll('.setting-item');
        settingElements.forEach((settingEl, index) => {
            const warningEl = settingEl.querySelector('.vault-organizer-rule-warning') as HTMLElement | null;
            if (!warningEl) {
                return;
            }
            const currentRule = this.plugin.settings.rules[index];
            const isEnabled = currentRule?.enabled ?? false;
            settingEl.classList.toggle('vault-organizer-rule-disabled', !isEnabled);
            const error = this.plugin.getRuleErrorForIndex(index);
            const matchType = currentRule?.matchType ?? 'equals';
            const ruleRequiresValue = requiresValue(matchType);
            const hasValue = currentRule ? hasValidValue(currentRule) : false;

            if (error) {
                settingEl.classList.add('vault-organizer-rule-error');
                warningEl.textContent = `Invalid regular expression: ${error.message}`;
                warningEl.style.display = '';
            } else if (ruleRequiresValue && !hasValue) {
                settingEl.classList.add('vault-organizer-rule-error');
                warningEl.textContent = 'Value is required for contains/starts-with/ends-with rules.';
                warningEl.style.display = '';
            } else {
                settingEl.classList.remove('vault-organizer-rule-error');
                warningEl.textContent = '';
                warningEl.style.display = 'none';
            }
        });
    }
}

class RuleTagPickerModal extends FuzzySuggestModal<string> {
    constructor(app: App, private readonly tags: string[], private readonly onSelect: (tag: string) => void) {
        super(app);
    }

    getItems(): string[] {
        return this.tags;
    }

    getItemText(tag: string): string {
        return tag;
    }

    onChooseItem(tag: string): void {
        this.onSelect(tag);
    }
}

class RuleFrontmatterKeyPickerModal extends FuzzySuggestModal<string> {
    constructor(app: App, private readonly keys: string[], private readonly onSelect: (key: string) => void) {
        super(app);
    }

    getItems(): string[] {
        return this.keys;
    }

    getItemText(key: string): string {
        return key;
    }

    onChooseItem(key: string): void {
        this.onSelect(key);
    }
}

class TestAllRulesModal extends Modal {
    constructor(
        app: App,
        private readonly results: RuleTestResult[],
        private readonly rules: SerializedFrontmatterRule[]
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Test All Rules - Preview' });

        const validResults = this.results.filter(result => result.newPath && !result.error);
        const invalidResults = this.results.filter(result => result.error);

        if (validResults.length === 0 && invalidResults.length === 0) {
            contentEl.createEl('p', {
                text: 'No files would be moved. All files are either already in the correct location or have no matching rules.',
            });
        } else {
            if (validResults.length) {
                contentEl.createEl('p', { text: `${validResults.length} file(s) would be moved:` });

                const resultsContainer = contentEl.createDiv({ cls: 'vault-organizer-test-results' });
                resultsContainer.style.maxHeight = '400px';
                resultsContainer.style.overflowY = 'auto';
                resultsContainer.style.marginTop = '1em';

                validResults.forEach(result => {
                    const resultEl = resultsContainer.createDiv({ cls: 'vault-organizer-test-result-item' });
                    resultEl.style.marginBottom = '1em';
                    resultEl.style.padding = '0.5em';
                    resultEl.style.border = '1px solid var(--background-modifier-border)';
                    resultEl.style.borderRadius = '4px';

                    const fileEl = resultEl.createDiv();
                    fileEl.createEl('strong', { text: 'File: ' });
                    fileEl.createSpan({ text: result.file.basename });

                    const fromEl = resultEl.createDiv();
                    fromEl.createEl('strong', { text: 'From: ' });
                    fromEl.createSpan({ text: result.currentPath });

                    const toEl = resultEl.createDiv();
                    toEl.createEl('strong', { text: 'To: ' });
                    toEl.createSpan({ text: result.newPath! });

                    const ruleEl = resultEl.createDiv();
                    ruleEl.createEl('strong', { text: 'Rule: ' });
                    ruleEl.createSpan({ text: `Rule ${result.ruleIndex + 1} (${this.rules[result.ruleIndex]?.key || 'unknown'})` });

                    if (result.warnings?.length) {
                        const warningsEl = resultEl.createDiv();
                        warningsEl.createEl('strong', { text: 'Warnings: ' });
                        warningsEl.createSpan({ text: result.warnings.join('; ') });
                    }
                });
            } else {
                contentEl.createEl('p', {
                    text: 'No files would be moved. All matching files are already in the correct location.',
                });
            }

            if (invalidResults.length) {
                contentEl.createEl('h3', { text: 'Skipped due to invalid destinations' });
                const skippedContainer = contentEl.createDiv({ cls: 'vault-organizer-test-results' });
                skippedContainer.style.maxHeight = '400px';
                skippedContainer.style.overflowY = 'auto';
                skippedContainer.style.marginTop = '1em';

                invalidResults.forEach(result => {
                    const resultEl = skippedContainer.createDiv({ cls: 'vault-organizer-test-result-item' });
                    resultEl.style.marginBottom = '1em';
                    resultEl.style.padding = '0.5em';
                    resultEl.style.border = '1px solid var(--background-modifier-border)';
                    resultEl.style.borderRadius = '4px';

                    const fileEl = resultEl.createDiv();
                    fileEl.createEl('strong', { text: 'File: ' });
                    fileEl.createSpan({ text: result.file.basename });

                    const fromEl = resultEl.createDiv();
                    fromEl.createEl('strong', { text: 'From: ' });
                    fromEl.createSpan({ text: result.currentPath });

                    const ruleEl = resultEl.createDiv();
                    ruleEl.createEl('strong', { text: 'Rule: ' });
                    ruleEl.createSpan({ text: `Rule ${result.ruleIndex + 1} (${this.rules[result.ruleIndex]?.key || 'unknown'})` });

                    const reasonEl = resultEl.createDiv();
                    reasonEl.createEl('strong', { text: 'Reason: ' });
                    reasonEl.createSpan({
                        text: result.error?.getUserMessage() ?? 'Destination path is invalid and the move cannot be previewed.',
                    });

                    if (result.warnings?.length) {
                        const warningsEl = resultEl.createDiv();
                        warningsEl.createEl('strong', { text: 'Warnings: ' });
                        warningsEl.createSpan({ text: result.warnings.join('; ') });
                    }
                });
            }
        }

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '1.5em';
        buttonContainer.style.textAlign = 'right';

        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

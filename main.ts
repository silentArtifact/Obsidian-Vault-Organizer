import {
    App,
    FuzzySuggestModal,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    debounce,
    getAllTags,
    normalizePath,
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
} from './src/rules';

// Remember to rename these classes and interfaces!

interface VaultOrganizerSettings {
    rules: SerializedFrontmatterRule[];
}

const DEFAULT_SETTINGS: VaultOrganizerSettings = {
    rules: [],
}

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

        const segments = normalizePath(folderPath).split('/').filter(Boolean);
        if (!segments.length) {
            return;
        }

        let currentPath = '';
        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            if (this.app.vault.getAbstractFileByPath(currentPath)) {
                continue;
            }

            await this.app.vault.createFolder(currentPath);
        }
    }

    private async applyRulesToFile(file: TFile): Promise<void> {
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

            const destinationFolder = normalizePath(trimmedDestination);
            const newPath = normalizePath(`${trimmedDestination}/${file.name}`);
            if (file.path === newPath) {
                return;
            }

            if (rule.debug) {
                const vaultName = this.app.vault.getName();
                new Notice(`DEBUG: ${file.basename} would be moved to ${vaultName}/${trimmedDestination}`);
                return;
            }

            await this.ensureFolderExists(destinationFolder);
            await this.app.fileManager.renameFile(file, newPath);
        } catch (err) {
            console.error('Failed to handle file change', err);
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

            const refreshWarning = () => {
                const error = this.plugin.getRuleErrorForIndex(index);
                if (error) {
                    setting.settingEl.classList.add('vault-organizer-rule-error');
                    warningEl.textContent = `Invalid regular expression: ${error.message}`;
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
            const updateRegexControlsVisibility = () => {
                const currentRule = this.plugin.settings.rules[index];
                const isRegex = (currentRule?.matchType ?? 'equals') === 'regex';
                if (flagsTextComponent) {
                    flagsTextComponent.inputEl.toggleAttribute('disabled', !isRegex);
                    flagsTextComponent.inputEl.disabled = !isRegex;
                    flagsTextComponent.inputEl.style.display = isRegex ? '' : 'none';
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
        });

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText('Add Rule')
                    .onClick(async () => {
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', matchType: 'equals', debug: false });
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
            const error = this.plugin.getRuleErrorForIndex(index);
            if (error) {
                settingEl.classList.add('vault-organizer-rule-error');
                warningEl.textContent = `Invalid regular expression: ${error.message}`;
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

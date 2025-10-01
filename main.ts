import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    normalizePath,
    Notice,
    debounce,
} from 'obsidian';
import {
    FrontmatterRule,
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
            ? [...loaded.rules]
            : [];
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loaded,
            rules,
        };
    }

    async saveSettings() {
        await this.saveData(this.settings);
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

    constructor(app: App, plugin: VaultOrganizer) {
        super(app, plugin);
        this.plugin = plugin;
        this.debouncedSaveOnly = debounce(async () => {
            await this.plugin.saveSettingsWithoutReorganizing();
        }, 300);
    }

    private scheduleSaveOnly() {
        this.debouncedSaveOnly();
    }

    private cancelPendingSaveOnly() {
        this.debouncedSaveOnly.cancel();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.plugin.settings.rules.forEach((rule, index) => {
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

            setting.addText(text =>
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
                    }));
            setting.addText(text =>
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
            setting.addToggle(toggle =>
                toggle
                    .setTooltip('Treat value as a regular expression')
                    .setValue(rule.isRegex ?? false)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.isRegex = value;
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('flags')
                    .setValue(rule.flags ?? '')
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.flags = value;
                        this.scheduleSaveOnly();
                    }));
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
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', isRegex: false, flags: '', debug: false });
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

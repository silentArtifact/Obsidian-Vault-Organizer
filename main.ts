import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    normalizePath,
    Notice,
} from 'obsidian';
import {
    FrontmatterRule,
    SerializedFrontmatterRule,
    deserializeFrontmatterRules,
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
        this.addSettingTab(new RuleSettingTab(this.app, this));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateRulesFromSettings() {
        this.rules = deserializeFrontmatterRules(this.settings.rules);
    }

    async saveSettingsAndRefreshRules() {
        this.updateRulesFromSettings();
        this.settings.rules = serializeFrontmatterRules(this.rules);
        await this.saveSettings();
        await this.reorganizeAllMarkdownFiles();
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

    constructor(app: App, plugin: VaultOrganizer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.plugin.settings.rules.forEach((rule, index) => {
            const setting = new Setting(containerEl)
                .setName(`Rule ${index + 1}`)
                .setDesc('Destination folder is required before the rule can move files.');
            setting.addText(text =>
                text
                    .setPlaceholder('key')
                    .setValue(rule.key)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.key = value;
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('value')
                    .setValue(rule.value)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.value = value;
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('destination folder (required)')
                    .setValue(rule.destination)
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.destination = value;
                        await this.plugin.saveSettingsAndRefreshRules();
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
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('flags')
                    .setValue(rule.flags ?? '')
                    .onChange(async (value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.flags = value;
                        await this.plugin.saveSettingsAndRefreshRules();
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
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addButton(btn =>
                btn
                    .setButtonText('Remove')
                    .onClick(async () => {
                        this.plugin.settings.rules.splice(index, 1);
                        await this.plugin.saveSettingsAndRefreshRules();
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText('Add Rule')
                    .onClick(async () => {
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', isRegex: false, flags: '', debug: false });
                        await this.plugin.saveSettingsAndRefreshRules();
                        this.display();
                    }));
    }
}

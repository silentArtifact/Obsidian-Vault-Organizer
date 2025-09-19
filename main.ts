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

            try {
                const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
                if (!frontmatter) {
                    return;
                }

                const rule = matchFrontmatter.call(this, file, this.rules);
                if (!rule) {
                    return;
                }

                const newPath = normalizePath(`${rule.destination}/${file.name}`);
                if (file.path === newPath) {
                    return;
                }

                if (rule.debug) {
                    const vaultName = this.app.vault.getName();
                    new Notice(`DEBUG: ${file.basename} would be moved to ${vaultName}/${rule.destination}`);
                    return;
                }

                await this.app.fileManager.renameFile(file, newPath);
            } catch (err) {
                console.error('Failed to handle file change', err);
            }
        };

        this.registerEvent(this.app.vault.on('modify', handleFileChange));
        this.registerEvent(this.app.vault.on('create', handleFileChange));

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
        await this.saveSettings();
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
            const setting = new Setting(containerEl).setName(`Rule ${index + 1}`);
            setting.addText(text =>
                text
                    .setPlaceholder('key')
                    .setValue(rule.key)
                    .onChange(async (value) => {
                        rule.key = value;
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('value')
                    .setValue(rule.value)
                    .onChange(async (value) => {
                        rule.value = value;
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addText(text =>
                text
                    .setPlaceholder('destination')
                    .setValue(rule.destination)
                    .onChange(async (value) => {
                        rule.destination = value;
                        await this.plugin.saveSettingsAndRefreshRules();
                    }));
            setting.addToggle(toggle =>
                toggle
                    .setTooltip('Enable debug mode')
                    .setValue(rule.debug ?? false)
                    .onChange(async (value) => {
                        rule.debug = value;
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
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', debug: false });
                        await this.plugin.saveSettingsAndRefreshRules();
                        this.display();
                    }));
    }
}

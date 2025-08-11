import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    normalizePath,
} from 'obsidian';
import {
    FrontmatterRule,
    SerializedFrontmatterRule,
    deserializeFrontmatterRules,
    matchFrontmatter,
} from './src/rules';

// Remember to rename these classes and interfaces!

interface VaultOrganizerSettings {
    mySetting: string;
    rules: SerializedFrontmatterRule[];
}

const DEFAULT_SETTINGS: VaultOrganizerSettings = {
    mySetting: 'default',
    rules: [],
}

export default class VaultOrganizer extends Plugin {
    settings: VaultOrganizerSettings;
    private rules: FrontmatterRule[] = [];

    async onload() {
        await this.loadSettings();
        this.rules = deserializeFrontmatterRules(this.settings.rules);

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

                await this.app.fileManager.renameFile(file, newPath);
            } catch (err) {
                console.error('Failed to handle file change', err);
            }
        };

        this.registerEvent(this.app.vault.on('modify', handleFileChange));
        this.registerEvent(this.app.vault.on('create', handleFileChange));

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new VaultOrganizerSettingTab(this.app, this));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class VaultOrganizerSettingTab extends PluginSettingTab {
    plugin: VaultOrganizer;

    constructor(app: App, plugin: VaultOrganizer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Setting #1')
            .setDesc("It's a secret")
            .addText(text =>
                text
                    .setPlaceholder('Enter your secret')
                    .setValue(this.plugin.settings.mySetting)
                    .onChange(async (value) => {
                        this.plugin.settings.mySetting = value;
                        await this.plugin.saveSettings();
                    }));
    }
}

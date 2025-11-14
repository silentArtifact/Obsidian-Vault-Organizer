import { App, PluginSettingTab, Setting, debounce, getAllTags } from 'obsidian';
import type { TextComponent, ToggleComponent } from 'obsidian';
import type VaultOrganizer from '../../main';
import type { FrontmatterMatchType } from '../rules';
import { requiresValue, hasValidValue } from '../rules';
import { MATCH_TYPE_OPTIONS, normalizeSerializedRule } from '../types';
import { RuleTagPickerModal, RuleFrontmatterKeyPickerModal, TestAllRulesModal } from './modals';

export class RuleSettingTab extends PluginSettingTab {
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
            warningEl.classList.add('vault-organizer-rule-message');
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
                    warningEl.classList.add('vault-organizer-rule-error');
                    warningEl.classList.remove('vault-organizer-rule-warning');
                    warningEl.textContent = `Invalid regular expression: ${error.message}`;
                    warningEl.style.display = '';
                } else if (ruleRequiresValue && !hasValue) {
                    warningEl.classList.add('vault-organizer-rule-warning');
                    warningEl.classList.remove('vault-organizer-rule-error');
                    warningEl.textContent = 'Value is required for contains/starts-with/ends-with rules.';
                    warningEl.style.display = '';
                } else {
                    warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error');
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
            let caseInsensitiveToggleComponent: ToggleComponent | undefined;
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
            const warningEl = settingEl.querySelector('.vault-organizer-rule-message') as HTMLElement | null;
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
                warningEl.classList.add('vault-organizer-rule-error');
                warningEl.classList.remove('vault-organizer-rule-warning');
                warningEl.textContent = `Invalid regular expression: ${error.message}`;
                warningEl.style.display = '';
            } else if (ruleRequiresValue && !hasValue) {
                warningEl.classList.add('vault-organizer-rule-warning');
                warningEl.classList.remove('vault-organizer-rule-error');
                warningEl.textContent = 'Value is required for contains/starts-with/ends-with rules.';
                warningEl.style.display = '';
            } else {
                warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error');
                warningEl.textContent = '';
                warningEl.style.display = 'none';
            }
        });
    }
}

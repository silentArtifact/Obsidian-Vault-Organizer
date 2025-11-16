import { App, PluginSettingTab, Setting, debounce, getAllTags, Notice } from 'obsidian';
import type { TextComponent, ToggleComponent } from 'obsidian';
import type VaultOrganizer from '../../main';
import type { FrontmatterMatchType } from '../rules';
import { requiresValue, hasValidValue } from '../rules';
import { MATCH_TYPE_OPTIONS, normalizeSerializedRule } from '../types';
import { RuleTagPickerModal, RuleFrontmatterKeyPickerModal, TestAllRulesModal } from './modals';
import { SETTINGS_UI } from '../constants';
import { DEBOUNCE_CONFIG } from '../config';

/**
 * Validates regex flags to ensure they contain only valid characters.
 * Valid flags: g (global), i (case-insensitive), m (multiline), s (dotAll),
 *             u (unicode), y (sticky), d (hasIndices)
 *
 * @param flags - The regex flags string to validate
 * @returns An object containing validation result and sanitized flags
 */
function validateRegexFlags(flags: string): { valid: boolean; sanitized: string; invalid: string[] } {
    const validFlags = new Set(['g', 'i', 'm', 's', 'u', 'y', 'd']);
    const flagChars = flags.split('');
    const invalid: string[] = [];
    const sanitized: string[] = [];

    for (const char of flagChars) {
        if (validFlags.has(char)) {
            // Avoid duplicates in sanitized output
            if (!sanitized.includes(char)) {
                sanitized.push(char);
            }
        } else if (char.trim()) { // Ignore whitespace
            invalid.push(char);
        }
    }

    return {
        valid: invalid.length === 0,
        sanitized: sanitized.join(''),
        invalid,
    };
}

export class RuleSettingTab extends PluginSettingTab {
    plugin: VaultOrganizer;
    private debouncedSaveOnly: ReturnType<typeof debounce>;
    private debouncedRefreshMetadata: ReturnType<typeof debounce>;
    private aggregatedTags: string[] = [];
    private frontmatterKeys: string[] = [];
    // Cache invalidation flag - set to true when metadata changes
    private metadataCacheDirty = true;

    /**
     * Creates a new rule settings tab for the VaultOrganizer plugin.
     * Initializes debounced save handlers, refreshes metadata cache (tags and frontmatter keys),
     * and sets up event listeners for metadata updates.
     *
     * @param app - The Obsidian app instance
     * @param plugin - The VaultOrganizer plugin instance
     */
    constructor(app: App, plugin: VaultOrganizer) {
        super(app, plugin);
        this.plugin = plugin;
        this.debouncedSaveOnly = debounce(async () => {
            await this.plugin.saveSettingsWithoutReorganizing();
        }, DEBOUNCE_CONFIG.SETTINGS_SAVE_MS);
        this.debouncedRefreshMetadata = debounce(() => {
            // Mark cache as dirty instead of immediately refreshing
            this.metadataCacheDirty = true;
        }, DEBOUNCE_CONFIG.METADATA_REFRESH_MS);
        this.refreshAggregatedTags();
        this.refreshFrontmatterKeys();
        this.plugin.registerEvent(this.plugin.app.metadataCache.on('resolved', () => {
            this.debouncedRefreshMetadata();
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
        this.metadataCacheDirty = false;
    }

    private getAggregatedTags(): string[] {
        // Only refresh if cache is dirty or empty
        if (this.metadataCacheDirty || !this.aggregatedTags.length) {
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
        this.metadataCacheDirty = false;
    }

    private getFrontmatterKeys(): string[] {
        // Only refresh if cache is dirty or empty
        if (this.metadataCacheDirty || !this.frontmatterKeys.length) {
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

    /**
     * Displays the settings tab UI with all rule configurations.
     * Creates UI controls for each rule including:
     * - Enable/disable toggle
     * - Rule ordering controls (up/down arrows)
     * - Frontmatter key and value inputs with picker buttons
     * - Destination folder input
     * - Match type dropdown (equals, contains, regex, etc.)
     * - Case sensitivity and debug toggles
     * - Remove button
     * Also provides buttons to add new rules, apply changes, and test all rules.
     * Overrides PluginSettingTab.display().
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        // Mark cache as dirty when displaying settings to ensure fresh data
        this.metadataCacheDirty = true;
        this.plugin.settings.rules = this.plugin.settings.rules.map(normalizeSerializedRule);

        this.plugin.settings.rules.forEach((rule, index) => {
            const currentMatchType: FrontmatterMatchType = rule.matchType ?? 'equals';
            const setting = new Setting(containerEl)
                .setName(`${SETTINGS_UI.RULE_NAME} ${index + 1}`)
                .setDesc(SETTINGS_UI.RULE_DESCRIPTION);
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
                    .setTooltip(SETTINGS_UI.TOOLTIPS.ACTIVATE_RULE)
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
                    .setTooltip(SETTINGS_UI.TOOLTIPS.MOVE_UP)
                    .setDisabled(index === 0)
                    .onClick(async () => {
                        if (index === 0) return;
                        // Swap with previous rule
                        const temp = this.plugin.settings.rules[index];
                        this.plugin.settings.rules[index] = this.plugin.settings.rules[index - 1];
                        this.plugin.settings.rules[index - 1] = temp;
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Rule order was not changed.');
                            console.error('Settings save error:', err);
                            // Revert the swap
                            const revert = this.plugin.settings.rules[index - 1];
                            this.plugin.settings.rules[index - 1] = this.plugin.settings.rules[index];
                            this.plugin.settings.rules[index] = revert;
                        }
                    }));

            // Add down arrow button
            setting.addExtraButton(button =>
                button
                    .setIcon('arrow-down')
                    .setTooltip(SETTINGS_UI.TOOLTIPS.MOVE_DOWN)
                    .setDisabled(index === this.plugin.settings.rules.length - 1)
                    .onClick(async () => {
                        if (index === this.plugin.settings.rules.length - 1) return;
                        // Swap with next rule
                        const temp = this.plugin.settings.rules[index];
                        this.plugin.settings.rules[index] = this.plugin.settings.rules[index + 1];
                        this.plugin.settings.rules[index + 1] = temp;
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Rule order was not changed.');
                            console.error('Settings save error:', err);
                            // Revert the swap
                            const revert = this.plugin.settings.rules[index + 1];
                            this.plugin.settings.rules[index + 1] = this.plugin.settings.rules[index];
                            this.plugin.settings.rules[index] = revert;
                        }
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
                    warningEl.textContent = SETTINGS_UI.WARNINGS.INVALID_REGEX(error.message);
                    warningEl.style.display = '';
                } else if (ruleRequiresValue && !hasValue) {
                    warningEl.classList.add('vault-organizer-rule-warning');
                    warningEl.classList.remove('vault-organizer-rule-error');
                    warningEl.textContent = SETTINGS_UI.WARNINGS.VALUE_REQUIRED;
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
                    .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.KEY)
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
                    .setTooltip(SETTINGS_UI.TOOLTIPS.BROWSE_FRONTMATTER)
                    .onClick(() => {
                        const keys = this.getFrontmatterKeys();
                        this.openFrontmatterKeyPicker(keys, (key) => {
                            // Check if rule at index still exists (protects against deletion during modal)
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
                    .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.VALUE)
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
                    .setTooltip(SETTINGS_UI.TOOLTIPS.BROWSE_TAGS)
                    .onClick(() => {
                        const tags = this.getAggregatedTags();
                        this.openTagPicker(tags, (tag) => {
                            // Check if rule at index still exists (protects against deletion during modal)
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
                    .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.DESTINATION)
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

            // Conflict resolution dropdown
            setting.addDropdown(dropdown => {
                dropdown.selectEl.setAttribute('aria-label', 'Conflict resolution');
                dropdown.selectEl.setAttribute('title', SETTINGS_UI.TOOLTIPS.CONFLICT_RESOLUTION);
                dropdown.addOption('fail', 'Fail');
                dropdown.addOption('skip', 'Skip');
                dropdown.addOption('append-number', 'Add number');
                dropdown.addOption('append-timestamp', 'Add timestamp');
                dropdown
                    .setValue(rule.conflictResolution ?? 'fail')
                    .onChange((value: string) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.conflictResolution = value as 'fail' | 'skip' | 'append-number' | 'append-timestamp';
                        this.scheduleSaveOnly();
                    });
            });

            // Condition operator dropdown (AND/OR)
            setting.addDropdown(dropdown => {
                dropdown.selectEl.setAttribute('aria-label', 'Condition operator');
                dropdown.selectEl.setAttribute('title', SETTINGS_UI.TOOLTIPS.CONDITION_OPERATOR);
                dropdown.addOption('AND', 'AND');
                dropdown.addOption('OR', 'OR');
                dropdown
                    .setValue(rule.conditionOperator ?? 'AND')
                    .onChange((value: string) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        currentRule.conditionOperator = value as 'AND' | 'OR';
                        this.scheduleSaveOnly();
                    });
            });
            setting.addText(text => {
                flagsTextComponent = text;
                text
                    .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.FLAGS)
                    .setValue(rule.flags ?? '')
                    .onChange((value) => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        if (currentRule.matchType === 'regex') {
                            // Real-time validation of regex flags
                            const validation = validateRegexFlags(value);

                            if (!validation.valid) {
                                // Visual feedback: add warning class to input
                                text.inputEl.classList.add('vault-organizer-invalid-flags');
                                text.inputEl.title = `Invalid flag(s): ${validation.invalid.join(', ')}. Valid flags: g, i, m, s, u, y, d`;
                            } else {
                                text.inputEl.classList.remove('vault-organizer-invalid-flags');
                                text.inputEl.title = '';
                            }

                            // Always save the sanitized value
                            currentRule.flags = validation.sanitized;

                            // Update input if sanitized value differs (removes duplicates/invalid chars)
                            if (value !== validation.sanitized) {
                                text.setValue(validation.sanitized);
                            }

                            this.scheduleSaveOnly();
                        }
                    });
            });
            updateRegexControlsVisibility();

            setting.addToggle(toggle => {
                caseInsensitiveToggleComponent = toggle;
                toggle
                    .setTooltip(SETTINGS_UI.TOOLTIPS.CASE_INSENSITIVE)
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
                    .setTooltip(SETTINGS_UI.TOOLTIPS.DEBUG_MODE)
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
            // Add Condition button
            setting.addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.ADD_CONDITION)
                    .setTooltip(SETTINGS_UI.TOOLTIPS.ADD_CONDITION)
                    .onClick(async () => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        if (!currentRule.conditions) {
                            currentRule.conditions = [];
                        }
                        currentRule.conditions.push({
                            key: '',
                            value: '',
                            matchType: 'equals'
                        });
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Please try again.');
                            console.error('Settings save error:', err);
                            // Revert the change
                            currentRule.conditions.pop();
                        }
                    }));

            setting.addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.REMOVE)
                    .onClick(async () => {
                        const removedRule = this.plugin.settings.rules.splice(index, 1)[0];
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Rule was not removed.');
                            console.error('Settings save error:', err);
                            // Revert the change
                            this.plugin.settings.rules.splice(index, 0, removedRule);
                        }
                    }));

            // Additional Conditions Section
            if (rule.conditions && rule.conditions.length > 0) {
                rule.conditions.forEach((condition, conditionIndex) => {
                    const conditionSetting = new Setting(containerEl)
                        .setName(`${SETTINGS_UI.LABELS.CONDITIONS_SECTION} ${conditionIndex + 1}`)
                        .setClass('vault-organizer-condition');

                    // Condition key input
                    let conditionKeyComponent: TextComponent | undefined;
                    conditionSetting.addText(text => {
                        conditionKeyComponent = text;
                        text
                            .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.KEY)
                            .setValue(condition.key)
                            .onChange((value) => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions?.[conditionIndex]) {
                                    return;
                                }
                                currentRule.conditions[conditionIndex].key = value;
                                this.scheduleSaveOnly();
                            });
                    });

                    // Browse frontmatter keys button
                    conditionSetting.addExtraButton(button =>
                        button
                            .setIcon('list')
                            .setTooltip(SETTINGS_UI.TOOLTIPS.BROWSE_FRONTMATTER)
                            .onClick(() => {
                                const keys = this.getFrontmatterKeys();
                                this.openFrontmatterKeyPicker(keys, (key) => {
                                    const currentRule = this.plugin.settings.rules[index];
                                    if (!currentRule?.conditions?.[conditionIndex] || !conditionKeyComponent) {
                                        return;
                                    }
                                    conditionKeyComponent.setValue(key);
                                    currentRule.conditions[conditionIndex].key = key;
                                    this.scheduleSaveOnly();
                                });
                            }));

                    // Condition value input
                    let conditionValueComponent: TextComponent | undefined;
                    conditionSetting.addText(text => {
                        conditionValueComponent = text;
                        text
                            .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.VALUE)
                            .setValue(condition.value)
                            .onChange((value) => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions?.[conditionIndex]) {
                                    return;
                                }
                                currentRule.conditions[conditionIndex].value = value;
                                this.scheduleSaveOnly();
                            });
                    });

                    // Browse tags button
                    conditionSetting.addExtraButton(button =>
                        button
                            .setIcon('hashtag')
                            .setTooltip(SETTINGS_UI.TOOLTIPS.BROWSE_TAGS)
                            .onClick(() => {
                                const tags = this.getAggregatedTags();
                                this.openTagPicker(tags, (tag) => {
                                    const currentRule = this.plugin.settings.rules[index];
                                    if (!currentRule?.conditions?.[conditionIndex] || !conditionValueComponent) {
                                        return;
                                    }
                                    const nextValue = this.toggleTagValue(conditionValueComponent.getValue(), tag);
                                    conditionValueComponent.setValue(nextValue);
                                    currentRule.conditions[conditionIndex].value = nextValue;
                                    this.scheduleSaveOnly();
                                });
                            }));

                    // Match type dropdown for condition
                    const currentConditionMatchType: FrontmatterMatchType = condition.matchType ?? 'equals';
                    let conditionFlagsComponent: TextComponent | undefined;
                    let conditionCaseInsensitiveComponent: ToggleComponent | undefined;

                    const updateConditionRegexControlsVisibility = () => {
                        const currentRule = this.plugin.settings.rules[index];
                        const currentCondition = currentRule?.conditions?.[conditionIndex];
                        const isRegex = (currentCondition?.matchType ?? 'equals') === 'regex';
                        if (conditionFlagsComponent) {
                            conditionFlagsComponent.inputEl.toggleAttribute('disabled', !isRegex);
                            conditionFlagsComponent.inputEl.disabled = !isRegex;
                            conditionFlagsComponent.inputEl.style.display = isRegex ? '' : 'none';
                        }
                        if (conditionCaseInsensitiveComponent) {
                            conditionCaseInsensitiveComponent.toggleEl.style.display = isRegex ? 'none' : '';
                        }
                    };

                    conditionSetting.addDropdown(dropdown => {
                        dropdown.selectEl.setAttribute('aria-label', 'Match type');
                        MATCH_TYPE_OPTIONS.forEach(option => dropdown.addOption(option.value, option.label));
                        dropdown
                            .setValue(currentConditionMatchType)
                            .onChange(async (value) => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions?.[conditionIndex]) {
                                    return;
                                }
                                currentRule.conditions[conditionIndex].matchType = value as FrontmatterMatchType;
                                if (value === 'regex') {
                                    currentRule.conditions[conditionIndex].isRegex = true;
                                    currentRule.conditions[conditionIndex].flags = currentRule.conditions[conditionIndex].flags ?? '';
                                } else {
                                    delete currentRule.conditions[conditionIndex].isRegex;
                                    if ('flags' in currentRule.conditions[conditionIndex]) {
                                        delete currentRule.conditions[conditionIndex].flags;
                                    }
                                }
                                updateConditionRegexControlsVisibility();
                                this.cancelPendingSaveOnly();
                                await this.plugin.saveSettingsAndRefreshRules();
                                updateConditionRegexControlsVisibility();
                            });
                    });

                    // Regex flags input for condition
                    conditionSetting.addText(text => {
                        conditionFlagsComponent = text;
                        text
                            .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.FLAGS)
                            .setValue(condition.flags ?? '')
                            .onChange((value) => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions?.[conditionIndex]) {
                                    return;
                                }
                                if (currentRule.conditions[conditionIndex].matchType === 'regex') {
                                    // Real-time validation of regex flags
                                    const validation = validateRegexFlags(value);

                                    if (!validation.valid) {
                                        // Visual feedback: add warning class to input
                                        text.inputEl.classList.add('vault-organizer-invalid-flags');
                                        text.inputEl.title = `Invalid flag(s): ${validation.invalid.join(', ')}. Valid flags: g, i, m, s, u, y, d`;
                                    } else {
                                        text.inputEl.classList.remove('vault-organizer-invalid-flags');
                                        text.inputEl.title = '';
                                    }

                                    // Always save the sanitized value
                                    currentRule.conditions[conditionIndex].flags = validation.sanitized;

                                    // Update input if sanitized value differs (removes duplicates/invalid chars)
                                    if (value !== validation.sanitized) {
                                        text.setValue(validation.sanitized);
                                    }

                                    this.scheduleSaveOnly();
                                }
                            });
                    });

                    // Case insensitive toggle for condition
                    conditionSetting.addToggle(toggle => {
                        conditionCaseInsensitiveComponent = toggle;
                        toggle
                            .setTooltip(SETTINGS_UI.TOOLTIPS.CASE_INSENSITIVE)
                            .setValue(condition.caseInsensitive ?? false)
                            .onChange(async (value) => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions?.[conditionIndex]) {
                                    return;
                                }
                                currentRule.conditions[conditionIndex].caseInsensitive = value;
                                this.cancelPendingSaveOnly();
                                await this.plugin.saveSettingsAndRefreshRules();
                            });
                    });

                    // Remove condition button
                    conditionSetting.addButton(btn =>
                        btn
                            .setButtonText(SETTINGS_UI.BUTTONS.REMOVE_CONDITION)
                            .onClick(async () => {
                                const currentRule = this.plugin.settings.rules[index];
                                if (!currentRule?.conditions) {
                                    return;
                                }
                                const removedCondition = currentRule.conditions.splice(conditionIndex, 1)[0];
                                this.cancelPendingSaveOnly();
                                try {
                                    await this.plugin.saveSettingsWithoutReorganizing();
                                    this.display();
                                } catch (err) {
                                    new Notice('Failed to save settings. Condition was not removed.');
                                    console.error('Settings save error:', err);
                                    // Revert the change
                                    currentRule.conditions.splice(conditionIndex, 0, removedCondition);
                                }
                            }));

                    updateConditionRegexControlsVisibility();
                });
            }

            refreshWarning();
            updateEnabledState();
        });

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.ADD_RULE)
                    .onClick(async () => {
                        this.plugin.settings.rules.push({ key: '', value: '', destination: '', matchType: 'equals', debug: false, enabled: false });
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Rule was not added.');
                            console.error('Settings save error:', err);
                            // Revert the change
                            this.plugin.settings.rules.pop();
                        }
                    }));

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.APPLY_NOW)
                    .onClick(async () => {
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsAndRefreshRules();
                    }))
            .addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.TEST_ALL_RULES)
                    .setTooltip(SETTINGS_UI.TOOLTIPS.TEST_ALL_RULES)
                    .onClick(async () => {
                        this.cancelPendingSaveOnly();
                        await this.plugin.saveSettingsWithoutReorganizing();
                        const results = this.plugin.testAllRules();
                        new TestAllRulesModal(this.app, results, this.plugin.settings.rules).open();
                    }));

        // Exclusion Patterns Section
        // Note: UI for exclusion patterns will be added in a future update
        // For now, exclusion patterns can be configured by manually editing the plugin's data.json file
        // The backend fully supports exclusion patterns via the excludePatterns array in settings
    }

    /**
     * Refreshes validation warnings/errors for all rules in the settings UI.
     * Updates the warning message elements to show:
     * - Invalid regex errors
     * - Missing required values for match types that need them
     * - Enabled/disabled state styling
     * This method is called to update the UI without re-rendering the entire settings tab.
     */
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
                warningEl.textContent = SETTINGS_UI.WARNINGS.INVALID_REGEX(error.message);
                warningEl.style.display = '';
            } else if (ruleRequiresValue && !hasValue) {
                warningEl.classList.add('vault-organizer-rule-warning');
                warningEl.classList.remove('vault-organizer-rule-error');
                warningEl.textContent = SETTINGS_UI.WARNINGS.VALUE_REQUIRED;
                warningEl.style.display = '';
            } else {
                warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error');
                warningEl.textContent = '';
                warningEl.style.display = 'none';
            }
        });
    }
}

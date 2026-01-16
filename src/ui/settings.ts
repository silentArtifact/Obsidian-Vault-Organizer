import { App, PluginSettingTab, Setting, debounce, getAllTags, Notice } from 'obsidian';
import type { TextComponent, ToggleComponent } from 'obsidian';
import type VaultOrganizer from '../../main';
import type { FrontmatterMatchType } from '../rules';
import { requiresValue, hasValidValue } from '../rules';
import { MATCH_TYPE_OPTIONS, normalizeSerializedRule } from '../types';
import { RuleTagPickerModal, RuleFrontmatterKeyPickerModal, TestAllRulesModal } from './modals';
import { SETTINGS_UI } from '../constants';
import { DEBOUNCE_CONFIG } from '../config';
import { validateExclusionPattern, BUILT_IN_PATTERNS } from '../exclusionPatterns';
import { extractVariables } from '../variableSubstitution';

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
    private aggregatedTagsDirty = true;
    private frontmatterKeysDirty = true;

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
            this.markMetadataCachesDirty();
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

    private markMetadataCachesDirty() {
        this.aggregatedTagsDirty = true;
        this.frontmatterKeysDirty = true;
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
        this.aggregatedTagsDirty = false;
    }

    private getAggregatedTags(): string[] {
        // Only refresh if cache is dirty or empty
        if (this.aggregatedTagsDirty || !this.aggregatedTags.length) {
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
        this.frontmatterKeysDirty = false;
    }

    private getFrontmatterKeys(): string[] {
        // Only refresh if cache is dirty or empty
        if (this.frontmatterKeysDirty || !this.frontmatterKeys.length) {
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
        // Mark caches as dirty when displaying settings to ensure fresh data
        this.markMetadataCachesDirty();
        this.plugin.settings.rules = this.plugin.settings.rules.map(normalizeSerializedRule);

        this.plugin.settings.rules.forEach((rule, index) => {
            const currentMatchType: FrontmatterMatchType = rule.matchType ?? 'equals';
            const setting = new Setting(containerEl)
                .setName(`${SETTINGS_UI.RULE_NAME} ${index + 1}`)
                .setDesc(SETTINGS_UI.RULE_DESCRIPTION);
            setting.settingEl.classList.add('setting-item');
            setting.settingEl.classList.add('vault-organizer-rule-item');
            setting.settingEl.setAttribute('data-rule-index', String(index));
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
                const hasKey = currentRule ? (typeof currentRule.key === 'string' && currentRule.key.trim().length > 0) : false;
                const hasDestination = currentRule ? (typeof currentRule.destination === 'string' && currentRule.destination.trim().length > 0) : false;

                if (error) {
                    warningEl.classList.add('vault-organizer-rule-error');
                    warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-success');
                    warningEl.textContent = SETTINGS_UI.WARNINGS.INVALID_REGEX(error.message);
                    warningEl.style.display = '';
                } else if (!hasKey) {
                    warningEl.classList.add('vault-organizer-rule-warning');
                    warningEl.classList.remove('vault-organizer-rule-error', 'vault-organizer-rule-success');
                    warningEl.textContent = SETTINGS_UI.WARNINGS.KEY_REQUIRED;
                    warningEl.style.display = '';
                } else if (ruleRequiresValue && !hasValue) {
                    warningEl.classList.add('vault-organizer-rule-warning');
                    warningEl.classList.remove('vault-organizer-rule-error', 'vault-organizer-rule-success');
                    warningEl.textContent = SETTINGS_UI.WARNINGS.VALUE_REQUIRED;
                    warningEl.style.display = '';
                } else if (hasKey && hasDestination) {
                    // Show success indicator when rule is complete and valid
                    warningEl.classList.add('vault-organizer-rule-success');
                    warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error');
                    warningEl.textContent = SETTINGS_UI.SUCCESS.RULE_VALID;
                    warningEl.style.display = '';
                } else {
                    warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error', 'vault-organizer-rule-success');
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
            // Destination preview element
            const destinationPreviewEl = document.createElement('div');
            destinationPreviewEl.classList.add('vault-organizer-destination-preview');
            destinationPreviewEl.style.display = 'none';

            const updateDestinationPreview = (destination: string) => {
                const trimmed = destination.trim();
                if (!trimmed) {
                    destinationPreviewEl.style.display = 'none';
                    return;
                }

                const { variables } = extractVariables(trimmed);
                if (variables.length === 0) {
                    destinationPreviewEl.style.display = 'none';
                    return;
                }

                // Show preview with variable info
                destinationPreviewEl.innerHTML = '';
                const labelSpan = document.createElement('span');
                labelSpan.className = 'vault-organizer-destination-preview-label';
                labelSpan.textContent = 'Variables: ';
                destinationPreviewEl.appendChild(labelSpan);

                const varsText = document.createTextNode(variables.map(v => `{${v}}`).join(', '));
                destinationPreviewEl.appendChild(varsText);

                destinationPreviewEl.style.display = '';
            };

            // Initialize preview with current value
            updateDestinationPreview(rule.destination);

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
                        updateDestinationPreview(value);
                        this.scheduleSaveOnly();
                        refreshWarning();
                    }));

            // Append preview after the setting
            setting.settingEl.appendChild(destinationPreviewEl);

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

            // Condition operator dropdown (AND/OR) - only show when there are additional conditions
            setting.addDropdown(dropdown => {
                dropdown.selectEl.setAttribute('aria-label', 'Condition operator');
                dropdown.selectEl.setAttribute('title', SETTINGS_UI.TOOLTIPS.CONDITION_OPERATOR);
                dropdown.addOption('AND', 'AND');
                dropdown.addOption('OR', 'OR');
                // Hide the dropdown if there are no additional conditions
                const hasConditions = rule.conditions && rule.conditions.length > 0;
                dropdown.selectEl.style.display = hasConditions ? '' : 'none';
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

            // Duplicate rule button
            setting.addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.DUPLICATE)
                    .setTooltip(SETTINGS_UI.TOOLTIPS.DUPLICATE_RULE)
                    .onClick(async () => {
                        const currentRule = this.plugin.settings.rules[index];
                        if (!currentRule) {
                            return;
                        }
                        // Create a deep copy of the rule
                        const duplicatedRule = JSON.parse(JSON.stringify(currentRule));
                        // Start disabled so user can review before activating
                        duplicatedRule.enabled = false;
                        // Insert after the current rule
                        this.plugin.settings.rules.splice(index + 1, 0, duplicatedRule);
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Rule was not duplicated.');
                            console.error('Settings save error:', err);
                            // Revert the change
                            this.plugin.settings.rules.splice(index + 1, 1);
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
                // Add conditions header with operator explanation
                const conditionsHeaderEl = document.createElement('div');
                conditionsHeaderEl.className = 'vault-organizer-conditions-header';
                containerEl.appendChild(conditionsHeaderEl);

                const operator = rule.conditionOperator ?? 'AND';
                const operatorBadge = document.createElement('span');
                operatorBadge.className = `vault-organizer-operator-badge vault-organizer-operator-${operator.toLowerCase()}`;
                operatorBadge.textContent = operator;
                conditionsHeaderEl.appendChild(operatorBadge);

                const operatorDesc = document.createElement('span');
                operatorDesc.className = 'vault-organizer-operator-desc';
                operatorDesc.textContent = operator === 'AND'
                    ? 'All conditions below must match'
                    : 'Any condition below can match';
                conditionsHeaderEl.appendChild(operatorDesc);

                // Create conditions container
                const conditionsContainer = document.createElement('div');
                conditionsContainer.className = 'vault-organizer-conditions-container';
                containerEl.appendChild(conditionsContainer);

                rule.conditions.forEach((condition, conditionIndex) => {
                    const conditionSetting = new Setting(conditionsContainer)
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

        // Exclusion Patterns Section - placed prominently after rules
        new Setting(containerEl)
            .setName(SETTINGS_UI.EXCLUSION_PATTERNS_NAME)
            .setDesc(SETTINGS_UI.EXCLUSION_PATTERNS_DESCRIPTION);

        // Display built-in patterns (read-only)
        if (BUILT_IN_PATTERNS.length > 0) {
            const builtInContainer = document.createElement('div');
            builtInContainer.className = 'vault-organizer-builtin-patterns';
            containerEl.appendChild(builtInContainer);

            const builtInHeading = document.createElement('div');
            builtInHeading.className = 'vault-organizer-builtin-heading';
            builtInHeading.textContent = 'Built-in Patterns (always active)';
            builtInContainer.appendChild(builtInHeading);

            BUILT_IN_PATTERNS.forEach((pattern) => {
                const patternItem = document.createElement('div');
                patternItem.className = 'vault-organizer-builtin-item';
                builtInContainer.appendChild(patternItem);

                const patternText = document.createElement('span');
                patternText.className = 'vault-organizer-builtin-pattern';
                patternText.textContent = pattern;
                patternItem.appendChild(patternText);

                const lockIcon = document.createElement('span');
                lockIcon.className = 'vault-organizer-builtin-lock';
                lockIcon.textContent = '🔒';
                lockIcon.setAttribute('aria-label', 'This pattern cannot be removed');
                patternItem.appendChild(lockIcon);
            });
        }

        // Display existing exclusion patterns
        this.plugin.settings.excludePatterns.forEach((pattern, index) => {
            new Setting(containerEl)
                .setName(`Pattern ${index + 1}`)
                .addText(text => {
                    text
                        .setPlaceholder(SETTINGS_UI.PLACEHOLDERS.EXCLUSION_PATTERN)
                        .setValue(pattern)
                        .onChange(async (value) => {
                            const trimmedValue = value.trim();
                            // Validate pattern in real-time
                            const validation = validateExclusionPattern(trimmedValue);
                            if (!validation.valid && trimmedValue !== '') {
                                text.inputEl.classList.add('vault-organizer-invalid-pattern');
                                text.inputEl.title = validation.error || 'Invalid pattern';
                            } else {
                                text.inputEl.classList.remove('vault-organizer-invalid-pattern');
                                text.inputEl.title = '';
                            }

                            this.plugin.settings.excludePatterns[index] = trimmedValue;
                            this.scheduleSaveOnly();
                        });
                    text.inputEl.style.width = '300px';
                })
                .addButton(btn =>
                    btn
                        .setButtonText(SETTINGS_UI.BUTTONS.REMOVE)
                        .setTooltip('Remove this exclusion pattern')
                        .onClick(async () => {
                            this.plugin.settings.excludePatterns.splice(index, 1);
                            this.cancelPendingSaveOnly();
                            try {
                                await this.plugin.saveSettingsWithoutReorganizing();
                                this.display();
                            } catch (err) {
                                new Notice('Failed to save settings. Pattern was not removed.');
                                console.error('Settings save error:', err);
                                // Revert the change
                                this.plugin.settings.excludePatterns.splice(index, 0, pattern);
                            }
                        }));
        });

        // Add new exclusion pattern button
        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText(SETTINGS_UI.BUTTONS.ADD_EXCLUSION)
                    .setTooltip('Add a new exclusion pattern')
                    .onClick(async () => {
                        this.plugin.settings.excludePatterns.push('');
                        this.cancelPendingSaveOnly();
                        try {
                            await this.plugin.saveSettingsWithoutReorganizing();
                            this.display();
                        } catch (err) {
                            new Notice('Failed to save settings. Pattern was not added.');
                            console.error('Settings save error:', err);
                            // Revert the change
                            this.plugin.settings.excludePatterns.pop();
                        }
                    }));

        // Add common pattern templates section
        const templatesContainer = document.createElement('div');
        templatesContainer.className = 'vault-organizer-pattern-templates';
        containerEl.appendChild(templatesContainer);

        const templatesHeading = document.createElement('h3');
        templatesHeading.className = 'vault-organizer-templates-heading';
        templatesHeading.textContent = 'Common Patterns';
        templatesContainer.appendChild(templatesHeading);

        const commonPatterns = [
            { pattern: 'Templates/**', description: 'Exclude all files in Templates folder' },
            { pattern: '*.excalidraw.md', description: 'Exclude Excalidraw drawings' },
            { pattern: 'Archive/**', description: 'Exclude all files in Archive folder' },
            { pattern: '**/Daily Notes/**', description: 'Exclude Daily Notes in any location' },
        ];

        const templatesList = document.createElement('div');
        templatesList.className = 'vault-organizer-template-list';
        templatesContainer.appendChild(templatesList);

        commonPatterns.forEach(({ pattern, description }) => {
            const templateItem = document.createElement('div');
            templateItem.className = 'vault-organizer-template-item';
            templatesList.appendChild(templateItem);

            const templateText = document.createElement('span');
            templateText.className = 'vault-organizer-template-pattern';
            templateText.textContent = pattern;
            templateItem.appendChild(templateText);

            const templateDesc = document.createElement('span');
            templateDesc.className = 'vault-organizer-template-desc';
            templateDesc.textContent = ` - ${description}`;
            templateItem.appendChild(templateDesc);

            const addButton = document.createElement('button');
            addButton.className = 'vault-organizer-template-add-btn';
            addButton.textContent = 'Add';
            templateItem.appendChild(addButton);

            addButton.addEventListener('click', async () => {
                // Check if pattern already exists
                if (this.plugin.settings.excludePatterns.includes(pattern)) {
                    new Notice('This pattern is already in your exclusion list.');
                    return;
                }

                this.plugin.settings.excludePatterns.push(pattern);
                this.cancelPendingSaveOnly();
                try {
                    await this.plugin.saveSettingsWithoutReorganizing();
                    new Notice(`Added exclusion pattern: ${pattern}`);
                    this.display();
                } catch (err) {
                    new Notice('Failed to save settings. Pattern was not added.');
                    console.error('Settings save error:', err);
                    // Revert the change
                    this.plugin.settings.excludePatterns.pop();
                }
            });
        });

        // Apply Now and Test All Rules buttons at the bottom
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
    }

    /**
     * Called when the settings tab is hidden.
     * Cancels any pending debounced operations to prevent orphaned callbacks.
     */
    hide(): void {
        // Cancel any pending debounced saves to prevent them from firing after tab is closed
        this.cancelPendingSaveOnly();
        // Also cancel metadata refresh operations
        this.debouncedRefreshMetadata.cancel();
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
        // Use the specific class and data attribute to find rule elements
        const settingElements = containerEl.querySelectorAll('.vault-organizer-rule-item[data-rule-index]');
        settingElements.forEach((settingEl) => {
            const warningEl = settingEl.querySelector('.vault-organizer-rule-message') as HTMLElement | null;
            if (!warningEl) {
                return;
            }
            // Get rule index from data attribute instead of DOM order
            const indexStr = settingEl.getAttribute('data-rule-index');
            if (indexStr === null) {
                return;
            }
            const index = parseInt(indexStr, 10);
            if (isNaN(index)) {
                return;
            }

            const currentRule = this.plugin.settings.rules[index];
            const isEnabled = currentRule?.enabled ?? false;
            settingEl.classList.toggle('vault-organizer-rule-disabled', !isEnabled);
            const error = this.plugin.getRuleErrorForIndex(index);
            const matchType = currentRule?.matchType ?? 'equals';
            const ruleRequiresValue = requiresValue(matchType);
            const ruleRequiresKey = true; // All rules need a key
            const hasValue = currentRule ? hasValidValue(currentRule) : false;
            const hasKey = currentRule ? (typeof currentRule.key === 'string' && currentRule.key.trim().length > 0) : false;

            const hasDestination = currentRule ? (typeof currentRule.destination === 'string' && currentRule.destination.trim().length > 0) : false;

            if (error) {
                warningEl.classList.add('vault-organizer-rule-error');
                warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-success');
                warningEl.textContent = SETTINGS_UI.WARNINGS.INVALID_REGEX(error.message);
                warningEl.style.display = '';
            } else if (ruleRequiresKey && !hasKey) {
                warningEl.classList.add('vault-organizer-rule-warning');
                warningEl.classList.remove('vault-organizer-rule-error', 'vault-organizer-rule-success');
                warningEl.textContent = SETTINGS_UI.WARNINGS.KEY_REQUIRED;
                warningEl.style.display = '';
            } else if (ruleRequiresValue && !hasValue) {
                warningEl.classList.add('vault-organizer-rule-warning');
                warningEl.classList.remove('vault-organizer-rule-error', 'vault-organizer-rule-success');
                warningEl.textContent = SETTINGS_UI.WARNINGS.VALUE_REQUIRED;
                warningEl.style.display = '';
            } else if (hasKey && hasDestination) {
                // Show success indicator when rule is complete and valid
                warningEl.classList.add('vault-organizer-rule-success');
                warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error');
                warningEl.textContent = SETTINGS_UI.SUCCESS.RULE_VALID;
                warningEl.style.display = '';
            } else {
                warningEl.classList.remove('vault-organizer-rule-warning', 'vault-organizer-rule-error', 'vault-organizer-rule-success');
                warningEl.textContent = '';
                warningEl.style.display = 'none';
            }
        });
    }
}

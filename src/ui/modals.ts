import { App, FuzzySuggestModal, Modal, Notice } from 'obsidian';
import type VaultOrganizer from '../../main';
import type { RuleTestResult } from '../types';
import type { SerializedFrontmatterRule } from '../rules';
import { MODALS } from '../constants';

/**
 * Modal that allows users to search and select from a list of tags.
 * Extends Obsidian's FuzzySuggestModal to provide fuzzy search functionality.
 */
export class RuleTagPickerModal extends FuzzySuggestModal<string> {
    /**
     * Creates a new tag picker modal.
     *
     * @param app - The Obsidian app instance
     * @param tags - Array of tag strings to display in the picker
     * @param onSelect - Callback function invoked when a tag is selected
     */
    constructor(app: App, private readonly tags: string[], private readonly onSelect: (tag: string) => void) {
        super(app);
    }

    /**
     * Returns the list of items to display in the fuzzy search modal.
     * Overrides FuzzySuggestModal.getItems().
     *
     * @returns Array of tag strings
     */
    getItems(): string[] {
        return this.tags;
    }

    /**
     * Returns the display text for a given tag item.
     * Overrides FuzzySuggestModal.getItemText().
     *
     * @param tag - The tag string to display
     * @returns The tag string as-is
     */
    getItemText(tag: string): string {
        return tag;
    }

    /**
     * Called when a tag is selected from the list.
     * Overrides FuzzySuggestModal.onChooseItem().
     *
     * @param tag - The selected tag string
     */
    onChooseItem(tag: string): void {
        this.onSelect(tag);
    }
}

/**
 * Modal that allows users to search and select from a list of frontmatter keys.
 * Extends Obsidian's FuzzySuggestModal to provide fuzzy search functionality.
 */
export class RuleFrontmatterKeyPickerModal extends FuzzySuggestModal<string> {
    /**
     * Creates a new frontmatter key picker modal.
     *
     * @param app - The Obsidian app instance
     * @param keys - Array of frontmatter key strings to display in the picker
     * @param onSelect - Callback function invoked when a key is selected
     */
    constructor(app: App, private readonly keys: string[], private readonly onSelect: (key: string) => void) {
        super(app);
    }

    /**
     * Returns the list of items to display in the fuzzy search modal.
     * Overrides FuzzySuggestModal.getItems().
     *
     * @returns Array of frontmatter key strings
     */
    getItems(): string[] {
        return this.keys;
    }

    /**
     * Returns the display text for a given frontmatter key item.
     * Overrides FuzzySuggestModal.getItemText().
     *
     * @param key - The frontmatter key string to display
     * @returns The key string as-is
     */
    getItemText(key: string): string {
        return key;
    }

    /**
     * Called when a frontmatter key is selected from the list.
     * Overrides FuzzySuggestModal.onChooseItem().
     *
     * @param key - The selected frontmatter key string
     */
    onChooseItem(key: string): void {
        this.onSelect(key);
    }
}

/**
 * Modal that displays the results of testing all rules against vault files.
 * Shows a preview of which files would be moved and where they would be moved to,
 * including warnings and errors for invalid moves.
 */
export class TestAllRulesModal extends Modal {
    /**
     * Creates a new test all rules modal.
     *
     * @param app - The Obsidian app instance
     * @param results - Array of rule test results containing file matches and potential moves
     * @param rules - Array of serialized frontmatter rules being tested
     */
    constructor(
        app: App,
        private readonly results: RuleTestResult[],
        private readonly rules: SerializedFrontmatterRule[]
    ) {
        super(app);
    }

    /**
     * Called when the modal is opened. Renders the test results UI showing:
     * - Files that would be moved with source and destination paths
     * - Files skipped due to errors or invalid destinations
     * - Associated rule information and warnings
     * Overrides Modal.onOpen().
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: MODALS.TEST_ALL_RULES.TITLE });

        const validResults = this.results.filter(result => result.newPath && !result.error);
        const invalidResults = this.results.filter(result => result.error);

        if (validResults.length === 0 && invalidResults.length === 0) {
            contentEl.createEl('p', {
                text: MODALS.TEST_ALL_RULES.NO_MOVES_OVERALL,
            });
        } else {
            if (validResults.length) {
                contentEl.createEl('p', { text: MODALS.TEST_ALL_RULES.FILES_WOULD_MOVE(validResults.length) });

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
                    fileEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.FILE });
                    fileEl.createSpan({ text: result.file.basename });

                    const fromEl = resultEl.createDiv();
                    fromEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.FROM });
                    fromEl.createSpan({ text: result.currentPath });

                    const toEl = resultEl.createDiv();
                    toEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.TO });
                    toEl.createSpan({ text: result.newPath || '(unknown)' });

                    const ruleEl = resultEl.createDiv();
                    ruleEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.RULE });
                    ruleEl.createSpan({ text: `Rule ${result.ruleIndex + 1} (${this.rules[result.ruleIndex]?.key || 'unknown'})` });

                    if (result.warnings?.length) {
                        const warningsEl = resultEl.createDiv();
                        warningsEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.WARNINGS });
                        warningsEl.createSpan({ text: result.warnings.join('; ') });
                    }
                });
            } else {
                contentEl.createEl('p', {
                    text: MODALS.TEST_ALL_RULES.NO_MOVES_ALREADY_CORRECT,
                });
            }

            if (invalidResults.length) {
                contentEl.createEl('h3', { text: MODALS.TEST_ALL_RULES.SKIPPED_SECTION });
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
                    fileEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.FILE });
                    fileEl.createSpan({ text: result.file.basename });

                    const fromEl = resultEl.createDiv();
                    fromEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.FROM });
                    fromEl.createSpan({ text: result.currentPath });

                    const ruleEl = resultEl.createDiv();
                    ruleEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.RULE });
                    ruleEl.createSpan({ text: `Rule ${result.ruleIndex + 1} (${this.rules[result.ruleIndex]?.key || 'unknown'})` });

                    const reasonEl = resultEl.createDiv();
                    reasonEl.createEl('strong', { text: 'Reason: ' });
                    reasonEl.createSpan({
                        text: result.error?.getUserMessage() ?? MODALS.TEST_ALL_RULES.INVALID_DESTINATION_WARNING,
                    });

                    if (result.warnings?.length) {
                        const warningsEl = resultEl.createDiv();
                        warningsEl.createEl('strong', { text: MODALS.TEST_ALL_RULES.LABELS.WARNINGS });
                        warningsEl.createSpan({ text: result.warnings.join('; ') });
                    }
                });
            }
        }

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '1.5em';
        buttonContainer.style.textAlign = 'right';

        const closeButton = buttonContainer.createEl('button', { text: MODALS.TEST_ALL_RULES.BUTTONS.CLOSE });
        closeButton.onclick = () => this.close();
    }

    /**
     * Called when the modal is closed. Cleans up the modal's content.
     * Overrides Modal.onClose().
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal that displays the history of file moves performed by the plugin.
 * Shows timestamps, file names, source and destination paths, and provides
 * an undo option for the most recent move.
 */
export class MoveHistoryModal extends Modal {
    /**
     * Creates a new move history modal.
     *
     * @param app - The Obsidian app instance
     * @param plugin - The VaultOrganizer plugin instance containing move history
     */
    constructor(app: App, private readonly plugin: VaultOrganizer) {
        super(app);
    }

    /**
     * Called when the modal is opened. Renders the move history UI showing:
     * - List of all moves in chronological order (most recent first)
     * - Timestamps, file names, source/destination paths, and rule information
     * - Undo button for the most recent move
     * - Clear history button to remove all history entries
     * Overrides Modal.onOpen().
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: MODALS.MOVE_HISTORY.TITLE });

        if (this.plugin.settings.moveHistory.length === 0) {
            contentEl.createEl('p', { text: MODALS.MOVE_HISTORY.NO_HISTORY });
        } else {
            contentEl.createEl('p', {
                text: MODALS.MOVE_HISTORY.SHOWING_COUNT(this.plugin.settings.moveHistory.length, this.plugin.settings.maxHistorySize),
            });

            const historyContainer = contentEl.createDiv({ cls: 'vault-organizer-history-container' });
            // Max height to keep modal manageable while showing ~8-10 history entries
            // Allows scrolling for larger histories without overwhelming the UI
            historyContainer.style.maxHeight = '500px';
            historyContainer.style.overflowY = 'auto';
            historyContainer.style.marginTop = '1em';

            this.plugin.settings.moveHistory.forEach((entry, index) => {
                const entryEl = historyContainer.createDiv({ cls: 'vault-organizer-history-item' });
                entryEl.style.marginBottom = '1em';
                entryEl.style.padding = '0.8em';
                entryEl.style.border = '1px solid var(--background-modifier-border)';
                entryEl.style.borderRadius = '4px';
                entryEl.style.position = 'relative';

                // Highlight the most recent move
                if (index === 0) {
                    entryEl.style.backgroundColor = 'var(--background-secondary-alt)';
                    entryEl.style.borderColor = 'var(--interactive-accent)';
                }

                const headerEl = entryEl.createDiv();
                headerEl.style.marginBottom = '0.5em';
                headerEl.style.fontWeight = 'bold';

                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleString();

                if (index === 0) {
                    headerEl.createEl('span', { text: MODALS.MOVE_HISTORY.MOST_RECENT_PREFIX, cls: 'vault-organizer-recent-label' });
                }
                headerEl.createSpan({ text: entry.fileName });

                const timeEl = entryEl.createDiv();
                timeEl.style.fontSize = '0.9em';
                timeEl.style.color = 'var(--text-muted)';
                timeEl.style.marginBottom = '0.5em';
                timeEl.textContent = MODALS.MOVE_HISTORY.TIME_PREFIX(timeStr);

                const fromEl = entryEl.createDiv();
                fromEl.createEl('strong', { text: MODALS.MOVE_HISTORY.LABELS.FROM });
                fromEl.createSpan({ text: entry.fromPath });

                const toEl = entryEl.createDiv();
                toEl.createEl('strong', { text: MODALS.MOVE_HISTORY.LABELS.TO });
                toEl.createSpan({ text: entry.toPath });

                const ruleEl = entryEl.createDiv();
                ruleEl.createEl('strong', { text: MODALS.MOVE_HISTORY.LABELS.RULE });
                ruleEl.createSpan({ text: entry.ruleKey || '(unknown)' });

                // Add undo button for most recent move only
                if (index === 0) {
                    const undoButtonEl = entryEl.createDiv();
                    undoButtonEl.style.marginTop = '0.8em';
                    const undoButton = undoButtonEl.createEl('button', { text: MODALS.MOVE_HISTORY.BUTTONS.UNDO });
                    undoButton.style.backgroundColor = 'var(--interactive-accent)';
                    undoButton.style.color = 'var(--text-on-accent)';
                    undoButton.style.padding = '0.4em 0.8em';
                    undoButton.style.border = 'none';
                    undoButton.style.borderRadius = '4px';
                    undoButton.style.cursor = 'pointer';
                    undoButton.onclick = async () => {
                        this.close();
                        await this.plugin.undoLastMove();
                    };
                }
            });
        }

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '1.5em';
        buttonContainer.style.textAlign = 'right';

        const clearButton = buttonContainer.createEl('button', { text: MODALS.MOVE_HISTORY.BUTTONS.CLEAR_HISTORY });
        clearButton.style.marginRight = '0.5em';
        clearButton.onclick = async () => {
            this.plugin.settings.moveHistory = [];
            await this.plugin.saveSettings();
            new Notice(MODALS.MOVE_HISTORY.NOTICES.HISTORY_CLEARED);
            this.close();
        };

        const closeButton = buttonContainer.createEl('button', { text: MODALS.MOVE_HISTORY.BUTTONS.CLOSE });
        closeButton.onclick = () => this.close();
    }

    /**
     * Called when the modal is closed. Cleans up the modal's content.
     * Overrides Modal.onClose().
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

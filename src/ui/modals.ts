import { App, FuzzySuggestModal, Modal, Notice } from 'obsidian';
import type VaultOrganizer from '../../main';
import type { RuleTestResult } from '../types';
import type { SerializedFrontmatterRule } from '../rules';

export class RuleTagPickerModal extends FuzzySuggestModal<string> {
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

export class RuleFrontmatterKeyPickerModal extends FuzzySuggestModal<string> {
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

export class TestAllRulesModal extends Modal {
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

export class MoveHistoryModal extends Modal {
    constructor(app: App, private readonly plugin: VaultOrganizer) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Move History' });

        if (this.plugin.settings.moveHistory.length === 0) {
            contentEl.createEl('p', { text: 'No move history yet.' });
        } else {
            contentEl.createEl('p', {
                text: `Showing ${this.plugin.settings.moveHistory.length} of last ${this.plugin.settings.maxHistorySize} moves.`,
            });

            const historyContainer = contentEl.createDiv({ cls: 'vault-organizer-history-container' });
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
                    headerEl.createEl('span', { text: '🔄 Most Recent: ', cls: 'vault-organizer-recent-label' });
                }
                headerEl.createSpan({ text: entry.fileName });

                const timeEl = entryEl.createDiv();
                timeEl.style.fontSize = '0.9em';
                timeEl.style.color = 'var(--text-muted)';
                timeEl.style.marginBottom = '0.5em';
                timeEl.textContent = `⏰ ${timeStr}`;

                const fromEl = entryEl.createDiv();
                fromEl.createEl('strong', { text: 'From: ' });
                fromEl.createSpan({ text: entry.fromPath });

                const toEl = entryEl.createDiv();
                toEl.createEl('strong', { text: 'To: ' });
                toEl.createSpan({ text: entry.toPath });

                const ruleEl = entryEl.createDiv();
                ruleEl.createEl('strong', { text: 'Rule: ' });
                ruleEl.createSpan({ text: entry.ruleKey || '(unknown)' });

                // Add undo button for most recent move only
                if (index === 0) {
                    const undoButtonEl = entryEl.createDiv();
                    undoButtonEl.style.marginTop = '0.8em';
                    const undoButton = undoButtonEl.createEl('button', { text: 'Undo This Move' });
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

        const clearButton = buttonContainer.createEl('button', { text: 'Clear History' });
        clearButton.style.marginRight = '0.5em';
        clearButton.onclick = async () => {
            this.plugin.settings.moveHistory = [];
            await this.plugin.saveSettings();
            new Notice('Move history cleared.');
            this.close();
        };

        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

import type { TFile } from 'obsidian';
import type {
    FrontmatterMatchType,
    SerializedFrontmatterRule,
} from './rules';
import type { InvalidPathError } from './errors';

export interface MoveHistoryEntry {
    timestamp: number;
    fileName: string;
    fromPath: string;
    toPath: string;
    ruleKey: string;
}

export interface VaultOrganizerSettings {
    rules: SerializedFrontmatterRule[];
    moveHistory: MoveHistoryEntry[];
    maxHistorySize: number;
}

export const DEFAULT_SETTINGS: VaultOrganizerSettings = {
    rules: [],
    moveHistory: [],
    maxHistorySize: 50,
};

export type RuleTestResult = {
    file: TFile;
    currentPath: string;
    ruleIndex: number;
    newPath?: string;
    warnings?: string[];
    error?: InvalidPathError;
};

export const MATCH_TYPE_OPTIONS: { value: FrontmatterMatchType; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts-with', label: 'Starts with' },
    { value: 'ends-with', label: 'Ends with' },
    { value: 'regex', label: 'Regular expression' },
];

export function normalizeSerializedRule(rule: SerializedFrontmatterRule): SerializedFrontmatterRule {
    const matchType: FrontmatterMatchType = rule.matchType ?? (rule.isRegex ? 'regex' : 'equals');
    const normalized: SerializedFrontmatterRule = {
        ...rule,
        matchType,
        key: rule.key ?? '',
        value: rule.value ?? '',
        destination: rule.destination ?? '',
        enabled: rule.enabled ?? false,
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

import type { TFile } from 'obsidian';
import type {
    FrontmatterMatchType,
    SerializedFrontmatterRule,
} from './rules';
import type { InvalidPathError } from './errors';
import { MATCH_TYPES } from './constants';

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
    /** Glob patterns for files/folders to exclude from automatic processing */
    excludePatterns: string[];
}

export const DEFAULT_SETTINGS: VaultOrganizerSettings = {
    rules: [],
    moveHistory: [],
    maxHistorySize: 50,
    excludePatterns: [],
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
    { value: 'equals', label: MATCH_TYPES.equals },
    { value: 'contains', label: MATCH_TYPES.contains },
    { value: 'starts-with', label: MATCH_TYPES['starts-with'] },
    { value: 'ends-with', label: MATCH_TYPES['ends-with'] },
    { value: 'regex', label: MATCH_TYPES.regex },
];

/**
 * Normalizes a serialized frontmatter rule to ensure consistent structure and valid defaults.
 * Handles migration from legacy isRegex format to matchType format, sets default values for
 * required fields, and cleans up regex-specific fields when not in regex mode.
 *
 * This function:
 * - Migrates legacy rules that used isRegex to the modern matchType field
 * - Ensures all required fields (key, value, destination, enabled) have default values
 * - Sets appropriate regex fields when matchType is 'regex'
 * - Removes regex-specific fields (isRegex, flags) when matchType is not 'regex'
 *
 * @param rule - The serialized rule to normalize
 * @returns A normalized copy of the rule with consistent structure and valid defaults
 */
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

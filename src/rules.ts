import { App, TFile } from 'obsidian';

export type FrontmatterMatchType = 'equals' | 'contains' | 'starts-with' | 'ends-with' | 'regex';

/**
 * Keys that should not be accessed in frontmatter to prevent prototype pollution.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface FrontmatterRule {
    key: string;
    matchType: FrontmatterMatchType;
    value: string | RegExp;
    destination: string;
    enabled?: boolean;
    debug?: boolean;
    caseInsensitive?: boolean;
}

export interface SerializedFrontmatterRule {
    key: string;
    matchType?: FrontmatterMatchType;
    value: string;
    destination: string;
    enabled?: boolean;
    isRegex?: boolean;
    flags?: string;
    debug?: boolean;
    caseInsensitive?: boolean;
}

/**
 * Finds the first matching rule for a file's frontmatter.
 * Iterates through rules and tests each against the file's frontmatter properties.
 * Supports multiple match types including equals, contains, starts-with, ends-with, and regex.
 * For array frontmatter values, checks if any element matches the rule criteria.
 *
 * @param this - Context object containing the Obsidian app instance for metadata access
 * @param file - The file to check frontmatter for
 * @param rules - Array of frontmatter rules to test against
 * @returns The first matching rule, or undefined if no rules match or file has no frontmatter
 */
export function matchFrontmatter(
    this: { app: App },
    file: TFile,
    rules: FrontmatterRule[],
    frontmatter?: Record<string, unknown>
): FrontmatterRule | undefined {
    const cacheFrontmatter = frontmatter ?? this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!cacheFrontmatter) {
        return undefined;
    }

    return rules.find(rule => {
        if (rule.enabled === false) {
            return false;
        }
        // Prevent prototype pollution
        if (DANGEROUS_KEYS.has(rule.key)) {
            return false;
        }
        const value = cacheFrontmatter[rule.key];
        if (value === undefined || value === null) {
            return false;
        }

        const isArrayValue = Array.isArray(value);
        const values = isArrayValue ? value : [value];
        const matchType: FrontmatterMatchType = rule.matchType ?? 'equals';

        if (matchType === 'regex') {
            if (!(rule.value instanceof RegExp)) {
                return false;
            }
            const regex = rule.value;
            return values.some(item => {
                const valueStr = String(item);
                regex.lastIndex = 0;
                return regex.test(valueStr);
            });
        }

        const ruleCandidates = getRuleCandidates(String(rule.value), isArrayValue);
        const normalizedCandidates =
            matchType === 'contains' || matchType === 'starts-with' || matchType === 'ends-with'
                ? ruleCandidates.filter(candidate => candidate.length > 0)
                : ruleCandidates;
        if (!normalizedCandidates.length) {
            return false;
        }

        return values.some(item => {
            const valueStr = String(item);
            return normalizedCandidates.some(candidate => matchByType(valueStr, candidate, matchType, rule.caseInsensitive));
        });
    });
}

/**
 * Generates candidate values for matching against frontmatter.
 * When matching against array frontmatter values, this expands a space-separated string
 * into individual tokens plus the full trimmed string, enabling flexible matching.
 * For non-array values, returns the original value as-is.
 *
 * @param value - The rule value to process
 * @param shouldExpand - Whether to expand the value into multiple candidates (true for array frontmatter)
 * @returns Array of candidate strings to match against
 * @example
 * // For array matching: "foo bar" -> ["foo bar", "foo", "bar"]
 * getRuleCandidates("foo bar", true)
 * // For single value matching: "foo bar" -> ["foo bar"]
 * getRuleCandidates("foo bar", false)
 */
function getRuleCandidates(value: string, shouldExpand: boolean): string[] {
    if (!shouldExpand) {
        return [value];
    }

    const trimmed = value.trim();
    const tokens = trimmed.split(/\s+/).map(token => token.trim()).filter(Boolean);

    if (!tokens.length) {
        return [trimmed];
    }

    const unique = new Set<string>();
    if (trimmed) {
        unique.add(trimmed);
    }
    tokens.forEach(token => unique.add(token));
    return Array.from(unique);
}

/**
 * Tests if a value matches a candidate string using the specified match type.
 * Supports four non-regex match types: equals (exact match), contains (substring),
 * starts-with (prefix), and ends-with (suffix).
 *
 * @param value - The frontmatter value to test
 * @param candidate - The candidate string from the rule to match against
 * @param matchType - The type of matching to perform
 * @param caseInsensitive - Whether to perform case-insensitive matching (default: false)
 * @returns true if the value matches according to the match type, false otherwise
 */
function matchByType(value: string, candidate: string, matchType: FrontmatterMatchType, caseInsensitive?: boolean): boolean {
    const val = caseInsensitive ? value.toLowerCase() : value;
    const cand = caseInsensitive ? candidate.toLowerCase() : candidate;

    switch (matchType) {
        case 'contains':
            return val.includes(cand);
        case 'starts-with':
            return val.startsWith(cand);
        case 'ends-with':
            return val.endsWith(cand);
        case 'equals':
        default:
            return val === cand;
    }
}

/**
 * Converts frontmatter rules to a serializable format for storage.
 * Handles RegExp values by extracting their source pattern and flags.
 * Non-regex values are converted to strings.
 *
 * @param rules - Array of frontmatter rules to serialize
 * @returns Array of serialized rules suitable for JSON storage
 */
export function serializeFrontmatterRules(rules: FrontmatterRule[]): SerializedFrontmatterRule[] {
    return rules.map(rule => {
        const matchType: FrontmatterMatchType = rule.matchType ?? 'equals';
        if (matchType === 'regex') {
            const pattern = rule.value instanceof RegExp ? rule.value.source : String(rule.value);
            const flags = rule.value instanceof RegExp ? rule.value.flags : '';
            return {
                key: rule.key,
                matchType,
                value: pattern,
                destination: rule.destination,
                enabled: rule.enabled ?? false,
                isRegex: true,
                flags,
                debug: rule.debug,
                caseInsensitive: rule.caseInsensitive,
            };
        }

        return {
            key: rule.key,
            matchType,
            value: String(rule.value),
            destination: rule.destination,
            enabled: rule.enabled ?? false,
            debug: rule.debug,
            caseInsensitive: rule.caseInsensitive,
        };
    });
}

export interface FrontmatterRuleDeserializationSuccess {
    index: number;
    rule: FrontmatterRule;
}

export interface FrontmatterRuleDeserializationError {
    index: number;
    message: string;
    rule: SerializedFrontmatterRule;
    cause: unknown;
}

export interface FrontmatterRuleDeserializationResult {
    rules: FrontmatterRule[];
    successes: FrontmatterRuleDeserializationSuccess[];
    errors: FrontmatterRuleDeserializationError[];
}

/**
 * Checks if a given match type requires a non-empty value to function correctly.
 * Match types like 'contains', 'starts-with', and 'ends-with' require a value to match against.
 *
 * @param matchType - The match type to check
 * @returns true if the match type requires a value, false otherwise
 */
export function requiresValue(matchType: FrontmatterMatchType): boolean {
    return matchType === 'contains' || matchType === 'starts-with' || matchType === 'ends-with';
}

/**
 * Validates if a serialized rule has a non-empty value.
 *
 * @param rule - The serialized rule to validate
 * @returns true if the rule has a valid (non-empty) value, false otherwise
 */
export function hasValidValue(rule: SerializedFrontmatterRule): boolean {
    return typeof rule.value === 'string' && rule.value.trim().length > 0;
}

/**
 * Deserializes frontmatter rules from storage format into runtime format.
 * Parses regex patterns and handles deserialization errors gracefully.
 * Failed regex patterns are logged but don't prevent other rules from loading.
 *
 * @param data - Array of serialized rules to deserialize (defaults to empty array)
 * @returns Object containing successfully deserialized rules, success details, and any errors encountered
 * @example
 * const result = deserializeFrontmatterRules(savedRules);
 * // result.rules contains all valid rules
 * // result.successes contains metadata about successful deserializations
 * // result.errors contains details about any regex parsing failures
 */
export function deserializeFrontmatterRules(data: SerializedFrontmatterRule[] = []): FrontmatterRuleDeserializationResult {
    const rules: FrontmatterRule[] = [];
    const successes: FrontmatterRuleDeserializationSuccess[] = [];
    const errors: FrontmatterRuleDeserializationError[] = [];

    data.forEach((rule, index) => {
        const matchType: FrontmatterMatchType = rule.matchType ?? (rule.isRegex ? 'regex' : 'equals');
        if (matchType === 'regex') {
            try {
                const regex = new RegExp(rule.value, rule.flags);
                const parsedRule: FrontmatterRule = {
                    key: rule.key,
                    matchType,
                    value: regex,
                    destination: rule.destination,
                    enabled: rule.enabled ?? false,
                    debug: rule.debug,
                    caseInsensitive: rule.caseInsensitive,
                };
                rules.push(parsedRule);
                successes.push({ index, rule: parsedRule });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const destinationInfo = rule.destination ? ` (destination: "${rule.destination}")` : '';
                const warningMessage = `[Obsidian Vault Organizer] Failed to deserialize regex for frontmatter rule "${rule.key}"${destinationInfo}: ${message}. Rule will be ignored.`;
                console.warn(warningMessage);
                errors.push({
                    index,
                    message,
                    rule: { ...rule, matchType },
                    cause: error,
                });
            }
        } else {
            const parsedRule: FrontmatterRule = {
                key: rule.key,
                matchType,
                value: rule.value,
                destination: rule.destination,
                enabled: rule.enabled ?? false,
                debug: rule.debug,
                caseInsensitive: rule.caseInsensitive,
            };
            rules.push(parsedRule);
            successes.push({ index, rule: parsedRule });
        }
    });

    return { rules, successes, errors };
}


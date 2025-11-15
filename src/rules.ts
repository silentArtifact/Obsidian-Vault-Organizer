import { App, TFile } from 'obsidian';
import { Logger } from './logger';

export type FrontmatterMatchType = 'equals' | 'contains' | 'starts-with' | 'ends-with' | 'regex';

export type ConditionOperator = 'AND' | 'OR';

export type ConflictResolution = 'fail' | 'skip' | 'append-number' | 'append-timestamp';

/**
 * A single condition within a rule.
 * Multiple conditions can be combined with AND/OR operators.
 */
export interface RuleCondition {
    key: string;
    matchType: FrontmatterMatchType;
    value: string | RegExp;
    caseInsensitive?: boolean;
}

export interface FrontmatterRule {
    /** Primary condition (for backward compatibility) */
    key: string;
    matchType: FrontmatterMatchType;
    value: string | RegExp;
    destination: string;
    enabled?: boolean;
    debug?: boolean;
    caseInsensitive?: boolean;
    /** Additional conditions (optional) */
    conditions?: RuleCondition[];
    /** How to combine conditions (defaults to AND) */
    conditionOperator?: ConditionOperator;
    /** How to handle file conflicts at destination */
    conflictResolution?: ConflictResolution;
}

export interface SerializedRuleCondition {
    key: string;
    matchType?: FrontmatterMatchType;
    value: string;
    isRegex?: boolean;
    flags?: string;
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
    /** Additional conditions (optional) */
    conditions?: SerializedRuleCondition[];
    /** How to combine conditions (defaults to AND) */
    conditionOperator?: ConditionOperator;
    /** How to handle file conflicts at destination */
    conflictResolution?: ConflictResolution;
}

/**
 * Tests if a single condition matches the frontmatter.
 *
 * @param condition - The condition to test
 * @param frontmatter - The frontmatter to test against
 * @returns true if the condition matches, false otherwise
 */
function testCondition(condition: RuleCondition, frontmatter: Record<string, unknown>): boolean {
    const value = frontmatter[condition.key];
    if (value === undefined || value === null) {
        return false;
    }

    const isArrayValue = Array.isArray(value);
    const values = isArrayValue ? value : [value];
    const matchType: FrontmatterMatchType = condition.matchType ?? 'equals';

    if (matchType === 'regex') {
        if (!(condition.value instanceof RegExp)) {
            return false;
        }
        const regex = condition.value;
        // Reset lastIndex before testing to prevent state issues with global flags
        regex.lastIndex = 0;
        return values.some(item => {
            const valueStr = String(item);
            // Reset again for each test to ensure clean state
            regex.lastIndex = 0;
            return regex.test(valueStr);
        });
    }

    const ruleCandidates = getRuleCandidates(String(condition.value), isArrayValue);
    const normalizedCandidates =
        matchType === 'contains' || matchType === 'starts-with' || matchType === 'ends-with'
            ? ruleCandidates.filter(candidate => candidate.length > 0)
            : ruleCandidates;
    if (!normalizedCandidates.length) {
        return false;
    }

    return values.some(item => {
        const valueStr = String(item);
        return normalizedCandidates.some(candidate => matchByType(valueStr, candidate, matchType, condition.caseInsensitive));
    });
}

/**
 * Finds the first matching rule for a file's frontmatter.
 * Iterates through rules and tests each against the file's frontmatter properties.
 * Supports multiple match types including equals, contains, starts-with, ends-with, and regex.
 * For array frontmatter values, checks if any element matches the rule criteria.
 * Supports multi-condition rules with AND/OR operators.
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

        // Create primary condition from rule properties
        const primaryCondition: RuleCondition = {
            key: rule.key,
            matchType: rule.matchType,
            value: rule.value,
            caseInsensitive: rule.caseInsensitive,
        };

        // Test primary condition
        const primaryMatch = testCondition(primaryCondition, cacheFrontmatter);

        // If no additional conditions, return primary match result
        if (!rule.conditions || rule.conditions.length === 0) {
            return primaryMatch;
        }

        // Test additional conditions
        const conditionResults = rule.conditions.map(condition => testCondition(condition, cacheFrontmatter));

        // Combine results based on operator
        const operator = rule.conditionOperator ?? 'AND';
        if (operator === 'AND') {
            // All conditions (including primary) must match
            return primaryMatch && conditionResults.every(result => result);
        } else {
            // At least one condition (including primary) must match
            return primaryMatch || conditionResults.some(result => result);
        }
    });
}

/**
 * Generates candidate values for matching against frontmatter.
 * When matching against array frontmatter values, this expands a space-separated string
 * into individual tokens plus the full trimmed string, enabling flexible matching.
 * For non-array values, returns the original value as-is.
 *
 * **Why this is needed:**
 * Obsidian frontmatter can contain array values like `tags: [work, urgent]`. When users
 * create rules to match these arrays, they might want to match individual items ("work")
 * or the combination ("work urgent"). This function creates all possible match candidates.
 *
 * **Deduplication:**
 * Uses a Set internally to prevent duplicate candidates, which could occur if the input
 * has repeated tokens or if trimming creates duplicates.
 *
 * @param value - The rule value to process
 * @param shouldExpand - Whether to expand the value into multiple candidates (true for array frontmatter)
 * @returns Array of unique candidate strings to match against
 * @example
 * // For array matching: "foo bar" -> ["foo bar", "foo", "bar"]
 * getRuleCandidates("foo bar", true)
 * // For single value matching: "foo bar" -> ["foo bar"]
 * getRuleCandidates("foo bar", false)
 * @example
 * // Deduplication in action
 * getRuleCandidates("work work urgent", true) // -> ["work work urgent", "work", "urgent"]
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
 * Serializes a single condition for storage.
 *
 * @param condition - The condition to serialize
 * @returns Serialized condition
 */
function serializeCondition(condition: RuleCondition): SerializedRuleCondition {
    const matchType: FrontmatterMatchType = condition.matchType ?? 'equals';
    if (matchType === 'regex') {
        const pattern = condition.value instanceof RegExp ? condition.value.source : String(condition.value);
        const flags = condition.value instanceof RegExp ? condition.value.flags : '';
        return {
            key: condition.key,
            matchType,
            value: pattern,
            isRegex: true,
            flags,
            caseInsensitive: condition.caseInsensitive,
        };
    }

    return {
        key: condition.key,
        matchType,
        value: String(condition.value),
        caseInsensitive: condition.caseInsensitive,
    };
}

/**
 * Converts frontmatter rules to a serializable format for storage.
 * Handles RegExp values by extracting their source pattern and flags.
 * Non-regex values are converted to strings.
 * Serializes multi-condition rules.
 *
 * @param rules - Array of frontmatter rules to serialize
 * @returns Array of serialized rules suitable for JSON storage
 */
export function serializeFrontmatterRules(rules: FrontmatterRule[]): SerializedFrontmatterRule[] {
    return rules.map(rule => {
        const matchType: FrontmatterMatchType = rule.matchType ?? 'equals';
        const serialized: SerializedFrontmatterRule = {
            key: rule.key,
            matchType,
            value: matchType === 'regex'
                ? (rule.value instanceof RegExp ? rule.value.source : String(rule.value))
                : String(rule.value),
            destination: rule.destination,
            enabled: rule.enabled ?? false,
            debug: rule.debug,
            caseInsensitive: rule.caseInsensitive,
            conditionOperator: rule.conditionOperator,
            conflictResolution: rule.conflictResolution,
        };

        if (matchType === 'regex') {
            serialized.isRegex = true;
            serialized.flags = rule.value instanceof RegExp ? rule.value.flags : '';
        }

        // Serialize additional conditions
        if (rule.conditions && rule.conditions.length > 0) {
            serialized.conditions = rule.conditions.map(serializeCondition);
        }

        return serialized;
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
 * Deserializes a single condition from storage format.
 *
 * @param serialized - The serialized condition
 * @returns Deserialized condition, or undefined if deserialization fails
 */
function deserializeCondition(serialized: SerializedRuleCondition): RuleCondition | undefined {
    const matchType: FrontmatterMatchType = serialized.matchType ?? (serialized.isRegex ? 'regex' : 'equals');

    if (matchType === 'regex') {
        try {
            const regex = new RegExp(serialized.value, serialized.flags);
            return {
                key: serialized.key,
                matchType,
                value: regex,
                caseInsensitive: serialized.caseInsensitive,
            };
        } catch (error) {
            Logger.warn(`Failed to deserialize regex condition for key "${serialized.key}"`, error);
            return undefined;
        }
    }

    return {
        key: serialized.key,
        matchType,
        value: serialized.value,
        caseInsensitive: serialized.caseInsensitive,
    };
}

/**
 * Deserializes frontmatter rules from storage format into runtime format.
 * Parses regex patterns and handles deserialization errors gracefully.
 * Failed regex patterns are logged but don't prevent other rules from loading.
 * Deserializes multi-condition rules.
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

        // Deserialize additional conditions
        let conditions: RuleCondition[] | undefined;
        if (rule.conditions && rule.conditions.length > 0) {
            const deserializedConditions = rule.conditions
                .map(deserializeCondition)
                .filter((c): c is RuleCondition => c !== undefined);

            if (deserializedConditions.length > 0) {
                conditions = deserializedConditions;
            }
        }

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
                    conditions,
                    conditionOperator: rule.conditionOperator,
                    conflictResolution: rule.conflictResolution,
                };
                rules.push(parsedRule);
                successes.push({ index, rule: parsedRule });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const destinationInfo = rule.destination ? ` (destination: "${rule.destination}")` : '';
                Logger.warn(
                    `Failed to deserialize regex for frontmatter rule "${rule.key}"${destinationInfo}: ${message}. Rule will be ignored.`,
                    error
                );
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
                conditions,
                conditionOperator: rule.conditionOperator,
                conflictResolution: rule.conflictResolution,
            };
            rules.push(parsedRule);
            successes.push({ index, rule: parsedRule });
        }
    });

    return { rules, successes, errors };
}


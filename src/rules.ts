import { App, TFile } from 'obsidian';

export type FrontmatterMatchType = 'equals' | 'contains' | 'starts-with' | 'ends-with' | 'regex';

export interface FrontmatterRule {
    key: string;
    matchType: FrontmatterMatchType;
    value: string | RegExp;
    destination: string;
    debug?: boolean;
}

export interface SerializedFrontmatterRule {
    key: string;
    matchType?: FrontmatterMatchType;
    value: string;
    destination: string;
    isRegex?: boolean;
    flags?: string;
    debug?: boolean;
}

export function matchFrontmatter(this: { app: App }, file: TFile, rules: FrontmatterRule[]): FrontmatterRule | undefined {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) {
        return undefined;
    }

    return rules.find(rule => {
        const value = frontmatter[rule.key];
        if (value === undefined || value === null) {
            return false;
        }

        const values = Array.isArray(value) ? value : [value];

        return values.some(item => {
            const valueStr = String(item);
            switch (rule.matchType) {
                case 'regex': {
                    if (!(rule.value instanceof RegExp)) {
                        return false;
                    }
                    rule.value.lastIndex = 0;
                    return rule.value.test(valueStr);
                }
                case 'contains':
                    return valueStr.includes(String(rule.value));
                case 'starts-with':
                    return valueStr.startsWith(String(rule.value));
                case 'ends-with':
                    return valueStr.endsWith(String(rule.value));
                case 'equals':
                default:
                    return valueStr === String(rule.value);
            }
        });
    });
}

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
                isRegex: true,
                flags,
                debug: rule.debug,
            };
        }

        return {
            key: rule.key,
            matchType,
            value: String(rule.value),
            destination: rule.destination,
            debug: rule.debug,
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
                    debug: rule.debug,
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
                debug: rule.debug,
            };
            rules.push(parsedRule);
            successes.push({ index, rule: parsedRule });
        }
    });

    return { rules, successes, errors };
}


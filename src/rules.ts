import { App, TFile } from 'obsidian';

export interface FrontmatterRule {
    key: string;
    value: string | RegExp;
    destination: string;
}

export interface SerializedFrontmatterRule {
    key: string;
    value: string;
    destination: string;
    isRegex?: boolean;
    flags?: string;
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
        const valueStr = String(value);
        if (rule.value instanceof RegExp) {
            return rule.value.test(valueStr);
        }
        return valueStr === rule.value;
    });
}

export function serializeFrontmatterRules(rules: FrontmatterRule[]): SerializedFrontmatterRule[] {
    return rules.map(rule => {
        if (rule.value instanceof RegExp) {
            return {
                key: rule.key,
                value: rule.value.source,
                destination: rule.destination,
                isRegex: true,
                flags: rule.value.flags,
            };
        }
        return {
            key: rule.key,
            value: rule.value,
            destination: rule.destination,
        };
    });
}

export function deserializeFrontmatterRules(data: SerializedFrontmatterRule[] = []): FrontmatterRule[] {
    return data.map(rule => ({
        key: rule.key,
        value: rule.isRegex ? new RegExp(rule.value, rule.flags) : rule.value,
        destination: rule.destination,
    }));
}


import { App, TFile } from 'obsidian';

export interface FrontmatterRule {
    key: string;
    value: string | RegExp;
    destination: string;
    debug?: boolean;
}

export interface SerializedFrontmatterRule {
    key: string;
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
            if (rule.value instanceof RegExp) {
                rule.value.lastIndex = 0;
                return rule.value.test(valueStr);
            }
            return valueStr === rule.value;
        });
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
                debug: rule.debug,
            };
        }
        return {
            key: rule.key,
            value: rule.value,
            destination: rule.destination,
            debug: rule.debug,
        };
    });
}

export function deserializeFrontmatterRules(data: SerializedFrontmatterRule[] = []): FrontmatterRule[] {
    const rules: FrontmatterRule[] = [];

    for (const rule of data) {
        if (rule.isRegex) {
            try {
                const regex = new RegExp(rule.value, rule.flags);
                rules.push({
                    key: rule.key,
                    value: regex,
                    destination: rule.destination,
                    debug: rule.debug,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const destinationInfo = rule.destination ? ` (destination: "${rule.destination}")` : '';
                const warningMessage = `[Obsidian Vault Organizer] Failed to deserialize regex for frontmatter rule "${rule.key}"${destinationInfo}: ${message}. Rule will be ignored.`;
                console.warn(warningMessage);
            }
        } else {
            rules.push({
                key: rule.key,
                value: rule.value,
                destination: rule.destination,
                debug: rule.debug,
            });
        }
    }

    return rules;
}


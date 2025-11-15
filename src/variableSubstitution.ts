/**
 * Variable substitution utilities for destination paths.
 * Supports {variable} syntax to insert frontmatter values into folder paths.
 *
 * Examples:
 * - "Projects/{project}" with frontmatter project: "Website" -> "Projects/Website"
 * - "Archive/{year}/{month}" with year: 2024, month: "January" -> "Archive/2024/January"
 */

import type { CachedMetadata } from 'obsidian';
import { validateDestinationPath } from './pathSanitization';

export interface SubstitutionResult {
    /** The path with variables substituted */
    substitutedPath: string;
    /** Variables that were successfully substituted */
    substituted: string[];
    /** Variables that were missing from frontmatter */
    missing: string[];
    /** Whether any variables were found in the template */
    hasVariables: boolean;
}

/**
 * Extracts variable names from a destination path template.
 *
 * @param template - Path template with {variable} syntax
 * @returns Array of variable names found in the template
 * @example
 * extractVariables("Projects/{project}/{status}") // ["project", "status"]
 */
export function extractVariables(template: string): string[] {
    const regex = /\{([^}]+)\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        variables.push(match[1]);
    }

    return variables;
}

/**
 * Sanitizes a frontmatter value for use in a file path.
 * Removes or replaces characters that are invalid in file paths.
 *
 * @param value - The frontmatter value to sanitize
 * @returns Sanitized string safe for use in paths
 */
function sanitizePathValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    let str = String(value);

    // Remove or replace invalid path characters
    // Invalid: < > : " / \ | ? *
    str = str.replace(/[<>:"|?*]/g, '');
    str = str.replace(/\\/g, '-');
    str = str.replace(/\//g, '-');

    // Trim whitespace and dots from start/end (invalid in Windows)
    str = str.trim().replace(/^\.+|\.+$/g, '');

    // Replace multiple spaces with single space
    str = str.replace(/\s+/g, ' ');

    return str;
}

/**
 * Substitutes variables in a destination path template with frontmatter values.
 * Variables are specified using {variableName} syntax.
 *
 * Missing variables are replaced with empty strings, which may result in
 * consecutive slashes that are automatically cleaned up.
 *
 * Array values are joined with slashes to create nested folder paths.
 * For example, tags: [work, project] becomes "work/project".
 * Date values are formatted as ISO date strings.
 *
 * @param template - Destination path template (e.g., "Projects/{project}/{status}")
 * @param frontmatter - Frontmatter metadata from the file
 * @returns Substitution result with the resolved path and metadata about what was substituted
 *
 * @example
 * const result = substituteVariables("Projects/{project}", {project: "Website"});
 * // result.substitutedPath === "Projects/Website"
 * // result.substituted === ["project"]
 * // result.missing === []
 *
 * @example
 * // Array values create nested paths
 * const result = substituteVariables("{tags}", {tags: ["work", "urgent"]});
 * // result.substitutedPath === "work/urgent"
 */
export function substituteVariables(
    template: string,
    frontmatter: Record<string, unknown> | undefined
): SubstitutionResult {
    const variables = extractVariables(template);

    if (variables.length === 0) {
        return {
            substitutedPath: template,
            substituted: [],
            missing: [],
            hasVariables: false,
        };
    }

    const substituted: string[] = [];
    const missing: string[] = [];
    let result = template;

    for (const variable of variables) {
        const value = frontmatter?.[variable];

        if (value === null || value === undefined) {
            missing.push(variable);
            // Replace with empty string - path will be validated later
            result = result.replace(new RegExp(`\\{${escapeRegex(variable)}\\}`, 'g'), '');
        } else {
            substituted.push(variable);
            let sanitizedValue: string;

            // Handle array values - join with '/' to create nested folder paths
            // Example: tags: [work, project] → "work/project"
            if (Array.isArray(value)) {
                sanitizedValue = value.map(v => sanitizePathValue(v)).filter(Boolean).join('/');
            } else {
                sanitizedValue = sanitizePathValue(value);
            }

            result = result.replace(new RegExp(`\\{${escapeRegex(variable)}\\}`, 'g'), sanitizedValue);
        }
    }

    // Clean up any consecutive slashes or leading/trailing slashes
    result = result.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');

    // Clean up any empty path segments
    result = result.split('/').filter(Boolean).join('/');

    return {
        substitutedPath: result,
        substituted,
        missing,
        hasVariables: true,
    };
}

/**
 * Escapes special regex characters in a string.
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp constructor
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates and substitutes variables in a destination path template.
 * Combines variable substitution with path validation.
 *
 * @param template - Destination path template
 * @param cache - Cached metadata containing frontmatter
 * @returns Object with validation result and substitution details
 */
export function validateAndSubstituteDestination(
    template: string,
    cache: CachedMetadata | null
): {
    valid: boolean;
    sanitizedPath?: string;
    substitutionResult: SubstitutionResult;
    error?: Error;
    warnings?: string[];
} {
    const frontmatter = cache?.frontmatter;
    const substitutionResult = substituteVariables(template, frontmatter);

    // If variables were missing, add a warning
    const warnings: string[] = [];
    if (substitutionResult.missing.length > 0) {
        warnings.push(`Missing frontmatter variables: ${substitutionResult.missing.join(', ')}`);
    }

    // Validate the substituted path
    const validation = validateDestinationPath(substitutionResult.substitutedPath);

    return {
        valid: validation.valid,
        sanitizedPath: validation.sanitizedPath,
        substitutionResult,
        error: validation.error,
        warnings: [...warnings, ...(validation.warnings || [])],
    };
}

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
import { PATH_LIMITS } from './config';

export interface SubstitutionResult {
    /** The path with variables substituted */
    substitutedPath: string;
    /** Variables that were successfully substituted */
    substituted: string[];
    /** Variables that were missing from frontmatter */
    missing: string[];
    /** Whether any variables were found in the template */
    hasVariables: boolean;
    /** Variables whose array values were truncated due to depth limit */
    truncated?: string[];
    /** Invalid variable names that were rejected */
    invalid?: string[];
}

/**
 * Maximum length for variable names to prevent memory issues.
 */
const MAX_VARIABLE_NAME_LENGTH = 100;

/**
 * Pattern for valid variable names.
 * Allows alphanumeric characters, underscores, hyphens, and dots.
 * Must start with a letter or underscore.
 * Dots are allowed for accessing nested properties (e.g., "project.name").
 */
const VALID_VARIABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_.-]{0,99}$/;

/**
 * Validates a variable name for safety and correctness.
 *
 * @param name - The variable name to validate
 * @returns True if valid, false otherwise
 */
function isValidVariableName(name: string): boolean {
    if (!name || name.length === 0) {
        return false;
    }

    if (name.length > MAX_VARIABLE_NAME_LENGTH) {
        return false;
    }

    // Check for path traversal attempts
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        return false;
    }

    // Must match valid identifier pattern
    return VALID_VARIABLE_NAME.test(name);
}

/**
 * Result of extracting variables from a template.
 */
export interface ExtractVariablesResult {
    /** Valid variable names found in the template */
    variables: string[];
    /** Invalid variable names that were rejected (for user feedback) */
    invalid: string[];
}

/**
 * Extracts and validates variable names from a destination path template.
 * Only returns valid variable names that pass security checks.
 * Also returns invalid variable names for user feedback.
 *
 * @param template - Path template with {variable} syntax
 * @returns Object containing valid variables and invalid variable names
 * @example
 * extractVariables("Projects/{project}/{status}") // { variables: ["project", "status"], invalid: [] }
 * extractVariables("Bad/{../etc/passwd}") // { variables: [], invalid: ["../etc/passwd"] }
 */
export function extractVariables(template: string): ExtractVariablesResult {
    const regex = /\{([^}]+)\}/g;
    const variables: string[] = [];
    const invalid: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        const varName = match[1];

        // Validate variable name before adding
        if (isValidVariableName(varName)) {
            variables.push(varName);
        } else {
            // Track invalid variable names for user feedback
            invalid.push(varName);
        }
    }

    return { variables, invalid };
}

/**
 * Gets a nested property value from an object using dot notation.
 * Supports accessing nested properties like "author.name" from { author: { name: "John" } }.
 *
 * @param obj - The object to get the property from
 * @param path - The property path (e.g., "author.name" or "simple")
 * @returns The value at the path, or undefined if not found
 * @example
 * getNestedValue({ author: { name: "John" } }, "author.name") // "John"
 * getNestedValue({ tags: ["a", "b"] }, "tags") // ["a", "b"]
 * getNestedValue({ author: { name: "John" } }, "author.age") // undefined
 */
function getNestedValue(obj: Record<string, unknown> | undefined, path: string): unknown {
    if (!obj || !path) {
        return undefined;
    }

    // Fast path for simple (non-nested) properties
    if (!path.includes('.')) {
        return obj[path];
    }

    // Handle nested property access
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
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
    const extractResult = extractVariables(template);
    const { variables, invalid } = extractResult;

    if (variables.length === 0 && invalid.length === 0) {
        return {
            substitutedPath: template,
            substituted: [],
            missing: [],
            hasVariables: false,
        };
    }

    const substituted: string[] = [];
    const missing: string[] = [];
    const truncated: string[] = [];
    let result = template;

    for (const variable of variables) {
        // Use getNestedValue to support dot notation for nested properties
        // e.g., "author.name" accesses frontmatter.author.name
        const value = getNestedValue(frontmatter, variable);
        // Pre-compile regex for this variable to avoid recreation
        const variableRegex = new RegExp(`\\{${escapeRegex(variable)}\\}`, 'g');

        if (value === null || value === undefined) {
            missing.push(variable);
            // Replace with empty string - path will be validated later
            result = result.replace(variableRegex, '');
        } else {
            substituted.push(variable);
            let sanitizedValue: string;

            // Handle array values - join with '/' to create nested folder paths
            // Example: tags: [work, project] → "work/project"
            if (Array.isArray(value)) {
                // Limit array depth to prevent excessively deep folder hierarchies
                const limitedArray = value.slice(0, PATH_LIMITS.MAX_ARRAY_PATH_DEPTH);
                if (value.length > PATH_LIMITS.MAX_ARRAY_PATH_DEPTH) {
                    truncated.push(variable);
                }
                sanitizedValue = limitedArray.map(v => sanitizePathValue(v)).filter(Boolean).join('/');
            } else {
                sanitizedValue = sanitizePathValue(value);
            }

            result = result.replace(variableRegex, sanitizedValue);
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
        hasVariables: variables.length > 0 || invalid.length > 0,
        truncated: truncated.length > 0 ? truncated : undefined,
        invalid: invalid.length > 0 ? invalid : undefined,
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

    // Collect warnings
    const warnings: string[] = [];

    // Warn about invalid variable names (e.g., path traversal attempts)
    if (substitutionResult.invalid && substitutionResult.invalid.length > 0) {
        warnings.push(`Invalid variable names (ignored): ${substitutionResult.invalid.join(', ')}`);
    }

    // Warn about missing frontmatter variables
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

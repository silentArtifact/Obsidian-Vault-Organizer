/**
 * Utilities for handling file/folder exclusion patterns.
 * Supports glob-style patterns to exclude files and folders from automatic processing.
 */

import { Logger } from './logger';

/**
 * Built-in exclusion patterns that are always applied and cannot be removed by users.
 * These protect critical Obsidian files from being moved by the plugin.
 */
export const BUILT_IN_PATTERNS: readonly string[] = [
    '.obsidian/**',
] as const;

/**
 * Maximum number of compiled regex patterns to cache.
 * Prevents unbounded memory growth in long-running sessions with dynamic patterns.
 * Made configurable to support users with many exclusion patterns.
 */
const MAX_REGEX_CACHE_SIZE = 200;

/**
 * Cache for compiled regex patterns to avoid recompilation.
 * Implements LRU (Least Recently Used) eviction when cache size exceeds MAX_REGEX_CACHE_SIZE.
 * Key: glob pattern string, Value: compiled RegExp
 */
const regexCache = new Map<string, RegExp>();

/**
 * Converts a glob pattern to a regular expression.
 * Results are cached to improve performance for repeated pattern matching.
 *
 * Supports:
 * - * matches any characters except /
 * - ** matches any characters including /
 * - ? matches a single character
 * - [abc] matches any character in the set
 *
 * @param pattern - Glob pattern to convert
 * @returns RegExp that matches the pattern
 */
function globToRegex(pattern: string): RegExp {
    // Check cache first
    const cached = regexCache.get(pattern);
    if (cached) {
        // Move to end (most recently used) by deleting and re-adding
        regexCache.delete(pattern);
        regexCache.set(pattern, cached);
        return cached;
    }

    const regex = compileGlobPattern(pattern);

    // LRU eviction: remove oldest entry if cache is full
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) {
        // Map iteration order is insertion order, so first key is the oldest
        const oldestKey = regexCache.keys().next().value;
        if (oldestKey !== undefined) {
            regexCache.delete(oldestKey);
        }
    }

    // Cache the compiled regex for future use
    regexCache.set(pattern, regex);
    return regex;
}

/**
 * Compiles a glob pattern into a RegExp.
 * Internal function that does the actual compilation work.
 * Includes safety checks to prevent ReDoS attacks from malicious patterns.
 *
 * @param pattern - Glob pattern to compile
 * @returns Compiled RegExp
 * @throws Error if pattern is too complex or potentially malicious
 */
function compileGlobPattern(pattern: string): RegExp {
    // Safety check: limit pattern length
    if (pattern.length > 1000) {
        Logger.warn(`Exclusion pattern too long (${pattern.length} chars), truncating to 1000`);
        pattern = pattern.substring(0, 1000);
    }

    let regexStr = '^';
    let i = 0;
    let wildcardCount = 0;
    const MAX_WILDCARDS = 50; // Prevent patterns with excessive wildcards

    while (i < pattern.length) {
        const char = pattern[i];

        if (char === '*') {
            wildcardCount++;
            if (wildcardCount > MAX_WILDCARDS) {
                Logger.warn(`Exclusion pattern has too many wildcards (>${MAX_WILDCARDS}), ignoring excess`);
                i += 1;
                continue;
            }

            // Check for **
            if (pattern[i + 1] === '*') {
                // ** matches everything including /
                regexStr += '.*';
                i += 2;
            } else {
                // * matches everything except /
                regexStr += '[^/]*';
                i += 1;
            }
        } else if (char === '?') {
            wildcardCount++;
            if (wildcardCount > MAX_WILDCARDS) {
                Logger.warn(`Exclusion pattern has too many wildcards (>${MAX_WILDCARDS}), ignoring excess`);
                i += 1;
                continue;
            }

            // ? matches any single character except /
            regexStr += '[^/]';
            i += 1;
        } else if (char === '[') {
            // Character class - copy as-is until ]
            const endIndex = pattern.indexOf(']', i);
            if (endIndex === -1) {
                // Malformed pattern, treat [ as literal
                regexStr += '\\[';
                i += 1;
            } else {
                regexStr += pattern.substring(i, endIndex + 1);
                i = endIndex + 1;
            }
        } else if (/[.+^${}()|\\]/.test(char)) {
            // Escape regex special characters
            regexStr += '\\' + char;
            i += 1;
        } else {
            // Regular character
            regexStr += char;
            i += 1;
        }
    }

    regexStr += '$';
    return new RegExp(regexStr);
}

/**
 * Checks if a file path matches any of the exclusion patterns.
 *
 * **Performance:** Uses cached regex compilation for fast repeated checks.
 * **Multi-level matching:** Handles both exact pattern matches and folder hierarchy matches.
 *
 * @param filePath - The file path to check (relative to vault root)
 * @param patterns - Array of glob patterns
 * @returns true if the file should be excluded, false otherwise
 *
 * @example
 * isExcluded("Templates/daily.md", ["Templates/**"]) // true
 * isExcluded("Notes/meeting.md", ["Templates/**"]) // false
 * isExcluded("Archive/old.md", ["Archive/*", "Trash/*"]) // true
 */
export function isExcluded(filePath: string, patterns: string[]): boolean {
    if (!patterns || patterns.length === 0) {
        return false;
    }

    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const pattern of patterns) {
        if (!pattern || pattern.trim() === '') {
            continue;
        }

        const normalizedPattern = pattern.trim().replace(/\\/g, '/');
        const regex = globToRegex(normalizedPattern);

        // Primary regex match - handles most cases including wildcards
        if (regex.test(normalizedPath)) {
            return true;
        }

        // Additional folder hierarchy check for literal (non-wildcard) patterns
        // This ensures "Templates" matches "Templates/subfolder/file.md"
        // but NOT "TemplatesBackup/file.md"
        if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?') && !normalizedPattern.includes('[')) {
            const folderPattern = normalizedPattern.replace(/\/$/, '');

            // Check if path is exactly the folder or starts with folder/
            if (normalizedPath === folderPattern || normalizedPath.startsWith(folderPattern + '/')) {
                // Verify it's a complete path segment match (not a partial string match)
                const pathSegments = normalizedPath.split('/');
                const patternSegments = folderPattern.split('/');

                // All pattern segments must match from the beginning
                const allSegmentsMatch = patternSegments.every((segment, i) => pathSegments[i] === segment);

                if (allSegmentsMatch) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Validates an exclusion pattern.
 *
 * @param pattern - The pattern to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateExclusionPattern(pattern: string): { valid: boolean; error?: string } {
    if (!pattern || pattern.trim() === '') {
        return { valid: false, error: 'Pattern cannot be empty' };
    }

    // Check for invalid characters
    if (/[<>:"|]/.test(pattern)) {
        return { valid: false, error: 'Pattern contains invalid characters' };
    }

    // Try to convert to regex to catch syntax errors
    try {
        globToRegex(pattern);
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid glob pattern syntax' };
    }
}

/**
 * Combines built-in patterns with user-defined patterns.
 * Built-in patterns are always included first and cannot be removed.
 *
 * @param userPatterns - User-defined exclusion patterns from settings (can be undefined or empty)
 * @returns Combined array of all exclusion patterns
 */
export function getAllExclusionPatterns(userPatterns?: string[]): string[] {
    return [...BUILT_IN_PATTERNS, ...(userPatterns ?? [])];
}

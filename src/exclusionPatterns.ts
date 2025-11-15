/**
 * Utilities for handling file/folder exclusion patterns.
 * Supports glob-style patterns to exclude files and folders from automatic processing.
 */

/**
 * Converts a glob pattern to a regular expression.
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
    let regexStr = '^';
    let i = 0;

    while (i < pattern.length) {
        const char = pattern[i];

        if (char === '*') {
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

        if (regex.test(normalizedPath)) {
            return true;
        }

        // Also check if the file is inside an excluded folder
        // e.g., "Templates" should exclude "Templates/subfolder/file.md"
        // but NOT "TemplatesBackup/file.md" (requires path boundary check)
        const folderPattern = normalizedPattern.replace(/\/$/, '');

        // Only match if pattern is at path boundary (start of path or after /)
        if (normalizedPath === folderPattern ||
            normalizedPath.startsWith(folderPattern + '/')) {
            // Additional safety: ensure no wildcard expansion confusion
            // If pattern has no wildcards, verify exact folder name match
            if (!folderPattern.includes('*') && !folderPattern.includes('?')) {
                // For patterns without wildcards, ensure we're matching a complete path segment
                const pathSegments = normalizedPath.split('/');
                const patternSegments = folderPattern.split('/');

                // Check if all pattern segments match from the start
                let matches = true;
                for (let i = 0; i < patternSegments.length; i++) {
                    if (pathSegments[i] !== patternSegments[i]) {
                        matches = false;
                        break;
                    }
                }

                if (matches) {
                    return true;
                }
            } else {
                // For patterns with wildcards, the startsWith check is sufficient
                return true;
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

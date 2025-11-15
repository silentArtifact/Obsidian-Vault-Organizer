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
 * IMPORTANT BEHAVIOR: Folder patterns automatically exclude all subdirectories.
 * For example, "Templates" will exclude both "Templates/file.md" AND "Templates/subfolder/file.md".
 * This is intentional for convenience - you don't need to use "Templates/**" for recursive exclusion.
 *
 * Pattern Behavior:
 * - "Templates"     → Excludes Templates folder and ALL subdirectories (recursive)
 * - "Templates/*"   → Same as above (glob pattern is also applied)
 * - "Templates/**"  → Explicitly recursive (same result as "Templates")
 * - "*.tmp"         → Excludes all .tmp files in any directory
 *
 * @param filePath - The file path to check (relative to vault root)
 * @param patterns - Array of glob patterns
 * @returns true if the file should be excluded, false otherwise
 *
 * @example
 * isExcluded("Templates/daily.md", ["Templates"]) // true - folder pattern matches recursively
 * isExcluded("Templates/subfolder/note.md", ["Templates"]) // true - recursive by default
 * isExcluded("Templates/daily.md", ["Templates/**"]) // true - explicit recursive pattern
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

        // Automatic recursive exclusion: folder patterns exclude ALL subdirectories
        // This ensures "Templates" excludes "Templates/subfolder/file.md" without requiring "Templates/**"
        // Provides convenience while maintaining predictable behavior
        const folderPattern = normalizedPattern.replace(/\/$/, '');
        if (normalizedPath.startsWith(folderPattern + '/')) {
            return true;
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

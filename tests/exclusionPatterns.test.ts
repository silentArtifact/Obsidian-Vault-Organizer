/**
 * Tests for exclusion patterns functionality
 */

import { isExcluded, validateExclusionPattern } from '../src/exclusionPatterns';

describe('isExcluded', () => {
    describe('basic pattern matching', () => {
        it('should exclude files matching exact path', () => {
            expect(isExcluded('Templates/daily.md', ['Templates/daily.md'])).toBe(true);
        });

        it('should not exclude non-matching files', () => {
            expect(isExcluded('Notes/meeting.md', ['Templates/daily.md'])).toBe(false);
        });

        it('should return false for empty patterns array', () => {
            expect(isExcluded('Templates/daily.md', [])).toBe(false);
        });

        it('should return false for null patterns', () => {
            expect(isExcluded('Templates/daily.md', null as any)).toBe(false);
        });

        it('should return false for undefined patterns', () => {
            expect(isExcluded('Templates/daily.md', undefined as any)).toBe(false);
        });

        it('should skip empty patterns', () => {
            expect(isExcluded('Notes/test.md', ['', 'Templates/**'])).toBe(false);
        });

        it('should skip whitespace-only patterns', () => {
            expect(isExcluded('Notes/test.md', ['   ', 'Templates/**'])).toBe(false);
        });

        it('should trim pattern whitespace', () => {
            expect(isExcluded('Templates/daily.md', ['  Templates/**  '])).toBe(true);
        });
    });

    describe('wildcard (*) patterns', () => {
        it('should match single * for any characters in segment', () => {
            expect(isExcluded('Templates/daily.md', ['Templates/*.md'])).toBe(true);
        });

        it('should not match * across directory separators', () => {
            expect(isExcluded('Templates/subfolder/daily.md', ['Templates/*.md'])).toBe(false);
        });

        it('should match * at start of pattern', () => {
            expect(isExcluded('Templates/daily.md', ['*.md'])).toBe(false);
            expect(isExcluded('daily.md', ['*.md'])).toBe(true);
        });

        it('should match * at end of pattern', () => {
            expect(isExcluded('Templates/file.txt', ['Templates/*'])).toBe(true);
        });

        it('should match multiple * in pattern', () => {
            expect(isExcluded('Templates/daily-note.md', ['Templates/*-*.md'])).toBe(true);
        });
    });

    describe('double wildcard (**) patterns', () => {
        it('should match ** for any path depth', () => {
            expect(isExcluded('Templates/daily.md', ['Templates/**'])).toBe(true);
            expect(isExcluded('Templates/subfolder/daily.md', ['Templates/**'])).toBe(true);
            expect(isExcluded('Templates/sub1/sub2/daily.md', ['Templates/**'])).toBe(true);
        });

        it('should match ** at start of pattern with subdirectories', () => {
            expect(isExcluded('any/path/to/file.md', ['**/file.md'])).toBe(true);
            expect(isExcluded('subfolder/file.md', ['**/file.md'])).toBe(true);
        });

        it('should match ** in middle of pattern with subdirectories', () => {
            expect(isExcluded('Templates/subfolder/notes/daily.md', ['Templates/**/daily.md'])).toBe(true);
            expect(isExcluded('Templates/notes/daily.md', ['Templates/**/daily.md'])).toBe(true);
        });

        it('should not match ** outside the pattern scope', () => {
            expect(isExcluded('Archive/old.md', ['Templates/**'])).toBe(false);
        });

        it('should match ** with no intermediate directories via folder check', () => {
            // Templates/** won't match Templates/daily.md via regex, but will via folder prefix check
            expect(isExcluded('Templates/daily.md', ['Templates/**'])).toBe(true);
        });
    });

    describe('question mark (?) patterns', () => {
        it('should match ? for single character', () => {
            expect(isExcluded('Templates/file1.md', ['Templates/file?.md'])).toBe(true);
            expect(isExcluded('Templates/fileA.md', ['Templates/file?.md'])).toBe(true);
        });

        it('should not match ? for multiple characters', () => {
            expect(isExcluded('Templates/file12.md', ['Templates/file?.md'])).toBe(false);
        });

        it('should not match ? for directory separator', () => {
            expect(isExcluded('Templates/subfolder/file.md', ['Templates?subfolder/file.md'])).toBe(false);
        });

        it('should match multiple ? in pattern', () => {
            expect(isExcluded('Templates/file-01.md', ['Templates/file-??.md'])).toBe(true);
        });
    });

    describe('character class ([]) patterns', () => {
        it('should match character class', () => {
            expect(isExcluded('Templates/fileA.md', ['Templates/file[ABC].md'])).toBe(true);
            expect(isExcluded('Templates/fileB.md', ['Templates/file[ABC].md'])).toBe(true);
            expect(isExcluded('Templates/fileC.md', ['Templates/file[ABC].md'])).toBe(true);
        });

        it('should not match characters outside class', () => {
            expect(isExcluded('Templates/fileD.md', ['Templates/file[ABC].md'])).toBe(false);
        });

        it('should match number ranges', () => {
            expect(isExcluded('file1.md', ['file[0-9].md'])).toBe(true);
            expect(isExcluded('file5.md', ['file[0-9].md'])).toBe(true);
        });

        it('should handle malformed character class', () => {
            expect(isExcluded('Templates/file[ABC.md', ['Templates/file[ABC.md'])).toBe(true);
        });
    });

    describe('regex special character escaping', () => {
        it('should escape dots', () => {
            expect(isExcluded('file.md', ['file.md'])).toBe(true);
            expect(isExcluded('fileXmd', ['file.md'])).toBe(false);
        });

        it('should escape plus signs', () => {
            expect(isExcluded('C++/notes.md', ['C++/**'])).toBe(true);
        });

        it('should escape parentheses', () => {
            expect(isExcluded('Notes (archive)/file.md', ['Notes (archive)/**'])).toBe(true);
        });

        it('should escape dollar signs', () => {
            expect(isExcluded('$temp/file.md', ['$temp/**'])).toBe(true);
        });

        it('should escape caret', () => {
            expect(isExcluded('^test/file.md', ['^test/**'])).toBe(true);
        });

        it('should escape curly braces', () => {
            expect(isExcluded('{templates}/file.md', ['{templates}/**'])).toBe(true);
        });

        it('should escape pipes', () => {
            expect(isExcluded('a|b/file.md', ['a|b/**'])).toBe(true);
        });
    });

    describe('path normalization', () => {
        it('should normalize backslashes to forward slashes in path', () => {
            expect(isExcluded('Templates\\daily.md', ['Templates/**'])).toBe(true);
        });

        it('should normalize backslashes in pattern', () => {
            expect(isExcluded('Templates/subfolder/daily.md', ['Templates\\**'])).toBe(true);
        });

        it('should handle mixed separators', () => {
            expect(isExcluded('Templates\\subfolder/daily.md', ['Templates/**'])).toBe(true);
        });
    });

    describe('folder-based exclusions', () => {
        it('should exclude files in folder when pattern is folder name', () => {
            expect(isExcluded('Templates/subfolder/file.md', ['Templates'])).toBe(true);
        });

        it('should exclude files in subfolder', () => {
            expect(isExcluded('Templates/sub1/sub2/file.md', ['Templates'])).toBe(true);
        });

        it('should handle folder pattern with trailing slash', () => {
            expect(isExcluded('Templates/file.md', ['Templates/'])).toBe(true);
        });

        it('should not exclude files with similar prefix', () => {
            expect(isExcluded('Templates2/file.md', ['Templates'])).toBe(false);
        });
    });

    describe('multiple patterns', () => {
        it('should match if any pattern matches', () => {
            const patterns = ['Templates/**', 'Archive/**', 'Trash/**'];
            expect(isExcluded('Templates/daily.md', patterns)).toBe(true);
            expect(isExcluded('Archive/old.md', patterns)).toBe(true);
            expect(isExcluded('Trash/deleted.md', patterns)).toBe(true);
        });

        it('should not match if no patterns match', () => {
            const patterns = ['Templates/**', 'Archive/**'];
            expect(isExcluded('Notes/meeting.md', patterns)).toBe(false);
        });

        it('should stop checking after first match', () => {
            const patterns = ['Templates/**', 'Archive/**', 'Notes/**'];
            expect(isExcluded('Templates/daily.md', patterns)).toBe(true);
        });
    });

    describe('complex real-world patterns', () => {
        it('should exclude .obsidian folder', () => {
            expect(isExcluded('.obsidian/workspace.json', ['.obsidian/**'])).toBe(true);
        });

        it('should exclude specific file extensions', () => {
            expect(isExcluded('Notes/temp.tmp', ['**/*.tmp'])).toBe(true);
            expect(isExcluded('subfolder/test.tmp', ['**/*.tmp'])).toBe(true);
        });

        it('should exclude draft files', () => {
            expect(isExcluded('Notes/my-draft-post.md', ['**/*draft*.md'])).toBe(true);
        });

        it('should exclude numbered backup files', () => {
            expect(isExcluded('Notes/file.md.1', ['**/*.md.[0-9]'])).toBe(true);
            expect(isExcluded('Notes/file.md.5', ['**/*.md.[0-9]'])).toBe(true);
        });

        it('should handle complex combination', () => {
            const patterns = [
                'Templates/**',
                '.obsidian/**',
                '**/*.tmp',
                '**/*draft*',
                'Archive/[0-9][0-9][0-9][0-9]/**',
            ];

            expect(isExcluded('Templates/daily.md', patterns)).toBe(true);
            expect(isExcluded('.obsidian/config.json', patterns)).toBe(true);
            expect(isExcluded('Notes/temp.tmp', patterns)).toBe(true);
            expect(isExcluded('Notes/draft-post.md', patterns)).toBe(true);
            expect(isExcluded('Archive/2024/old.md', patterns)).toBe(true);
            expect(isExcluded('Notes/regular.md', patterns)).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle empty file path', () => {
            expect(isExcluded('', ['Templates/**'])).toBe(false);
        });

        it('should handle root-level files', () => {
            expect(isExcluded('README.md', ['*.md'])).toBe(true);
        });

        it('should handle very deep paths', () => {
            const deepPath = 'a/b/c/d/e/f/g/h/i/j/file.md';
            expect(isExcluded(deepPath, ['a/**'])).toBe(true);
        });

        it('should handle unicode in paths', () => {
            expect(isExcluded('Templates/日記.md', ['Templates/**'])).toBe(true);
        });

        it('should handle spaces in paths', () => {
            expect(isExcluded('My Templates/daily note.md', ['My Templates/**'])).toBe(true);
        });
    });
});

describe('validateExclusionPattern', () => {
    it('should validate valid patterns', () => {
        expect(validateExclusionPattern('Templates/**')).toEqual({ valid: true });
        expect(validateExclusionPattern('**/*.md')).toEqual({ valid: true });
        expect(validateExclusionPattern('Archive/[0-9]/**')).toEqual({ valid: true });
    });

    it('should reject empty pattern', () => {
        const result = validateExclusionPattern('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Pattern cannot be empty');
    });

    it('should reject whitespace-only pattern', () => {
        const result = validateExclusionPattern('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Pattern cannot be empty');
    });

    it('should reject pattern with invalid characters', () => {
        expect(validateExclusionPattern('Templates/<test>').valid).toBe(false);
        expect(validateExclusionPattern('Templates/test:file').valid).toBe(false);
        expect(validateExclusionPattern('Templates/test"file').valid).toBe(false);
        expect(validateExclusionPattern('Templates/test|file').valid).toBe(false);
    });

    it('should provide error message for invalid characters', () => {
        const result = validateExclusionPattern('Templates/<test>');
        expect(result.error).toBe('Pattern contains invalid characters');
    });

    it('should allow valid special characters', () => {
        expect(validateExclusionPattern('Templates/*').valid).toBe(true);
        expect(validateExclusionPattern('Templates/**').valid).toBe(true);
        expect(validateExclusionPattern('Templates/?').valid).toBe(true);
        expect(validateExclusionPattern('Templates/[abc]').valid).toBe(true);
    });

    it('should handle patterns with dots', () => {
        expect(validateExclusionPattern('.obsidian/**').valid).toBe(true);
        expect(validateExclusionPattern('**/*.md').valid).toBe(true);
    });

    it('should handle patterns with spaces', () => {
        expect(validateExclusionPattern('My Templates/**').valid).toBe(true);
    });

    it('should handle patterns with parentheses', () => {
        expect(validateExclusionPattern('Notes (archive)/**').valid).toBe(true);
    });

    it('should handle patterns with hyphens', () => {
        expect(validateExclusionPattern('daily-notes/**').valid).toBe(true);
    });

    it('should handle patterns with underscores', () => {
        expect(validateExclusionPattern('test_files/**').valid).toBe(true);
    });
});

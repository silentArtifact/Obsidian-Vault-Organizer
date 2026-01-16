/**
 * Tests for variable substitution functionality
 */

import {
    extractVariables,
    substituteVariables,
    validateAndSubstituteDestination,
} from '../src/variableSubstitution';
import type { CachedMetadata } from 'obsidian';

describe('extractVariables', () => {
    it('should extract single variable', () => {
        const result = extractVariables('Projects/{project}');
        expect(result.variables).toEqual(['project']);
        expect(result.invalid).toEqual([]);
    });

    it('should extract multiple variables', () => {
        const result = extractVariables('Projects/{project}/{status}');
        expect(result.variables).toEqual(['project', 'status']);
        expect(result.invalid).toEqual([]);
    });

    it('should return empty arrays when no variables', () => {
        const result = extractVariables('Projects/Fixed');
        expect(result.variables).toEqual([]);
        expect(result.invalid).toEqual([]);
    });

    it('should reject variables with spaces and track them as invalid', () => {
        // Variables with spaces are now rejected for security
        const result = extractVariables('{project name}/{status code}');
        expect(result.variables).toEqual([]);
        expect(result.invalid).toEqual(['project name', 'status code']);
    });

    it('should handle duplicate variables', () => {
        const result = extractVariables('{project}/{project}');
        expect(result.variables).toEqual(['project', 'project']);
        expect(result.invalid).toEqual([]);
    });

    it('should reject nested braces and track as invalid', () => {
        // Nested braces are invalid variable names
        const result = extractVariables('{outer{inner}}');
        expect(result.variables).toEqual([]);
        expect(result.invalid).toEqual(['outer{inner']);
    });

    it('should handle valid variable names with underscores and hyphens', () => {
        const result = extractVariables('{project_name}/{status-code}');
        expect(result.variables).toEqual(['project_name', 'status-code']);
        expect(result.invalid).toEqual([]);
    });

    it('should reject path traversal attempts and track as invalid', () => {
        const result = extractVariables('{../etc/passwd}/{..\\windows}');
        expect(result.variables).toEqual([]);
        expect(result.invalid).toEqual(['../etc/passwd', '..\\windows']);
    });

    it('should reject very long variable names and track as invalid', () => {
        const longName = 'a'.repeat(150);
        const result = extractVariables(`{${longName}}`);
        expect(result.variables).toEqual([]);
        expect(result.invalid).toEqual([longName]);
    });
});

describe('substituteVariables', () => {
    it('should substitute single variable', () => {
        const result = substituteVariables('Projects/{project}', { project: 'Website' });
        expect(result.substitutedPath).toBe('Projects/Website');
        expect(result.substituted).toEqual(['project']);
        expect(result.missing).toEqual([]);
        expect(result.hasVariables).toBe(true);
    });

    it('should substitute multiple variables', () => {
        const result = substituteVariables('Projects/{project}/{status}', {
            project: 'Website',
            status: 'Active',
        });
        expect(result.substitutedPath).toBe('Projects/Website/Active');
        expect(result.substituted).toEqual(['project', 'status']);
        expect(result.missing).toEqual([]);
    });

    it('should handle missing variables', () => {
        const result = substituteVariables('Projects/{project}/{status}', { project: 'Website' });
        expect(result.substitutedPath).toBe('Projects/Website');
        expect(result.substituted).toEqual(['project']);
        expect(result.missing).toEqual(['status']);
    });

    it('should handle all missing variables', () => {
        const result = substituteVariables('Projects/{project}/{status}', {});
        expect(result.substitutedPath).toBe('Projects');
        expect(result.substituted).toEqual([]);
        expect(result.missing).toEqual(['project', 'status']);
    });

    it('should handle undefined frontmatter', () => {
        const result = substituteVariables('Projects/{project}', undefined);
        expect(result.substitutedPath).toBe('Projects');
        expect(result.missing).toEqual(['project']);
    });

    it('should handle no variables', () => {
        const result = substituteVariables('Projects/Fixed', { project: 'Website' });
        expect(result.substitutedPath).toBe('Projects/Fixed');
        expect(result.substituted).toEqual([]);
        expect(result.missing).toEqual([]);
        expect(result.hasVariables).toBe(false);
    });

    it('should sanitize invalid path characters', () => {
        const result = substituteVariables('Projects/{project}', {
            project: 'My<Project>:Name',
        });
        expect(result.substitutedPath).toBe('Projects/MyProjectName');
    });

    it('should replace slashes in values', () => {
        const result = substituteVariables('Projects/{project}', {
            project: 'Parent/Child',
        });
        expect(result.substitutedPath).toBe('Projects/Parent-Child');
    });

    it('should replace backslashes in values', () => {
        const result = substituteVariables('Projects/{project}', {
            project: 'Parent\\Child',
        });
        expect(result.substitutedPath).toBe('Projects/Parent-Child');
    });

    it('should trim whitespace', () => {
        const result = substituteVariables('Projects/{project}', {
            project: '  Website  ',
        });
        expect(result.substitutedPath).toBe('Projects/Website');
    });

    it('should trim leading/trailing dots', () => {
        const result = substituteVariables('Projects/{project}', {
            project: '...Website...',
        });
        expect(result.substitutedPath).toBe('Projects/Website');
    });

    it('should replace multiple spaces with single space', () => {
        const result = substituteVariables('Projects/{project}', {
            project: 'My    Project',
        });
        expect(result.substitutedPath).toBe('Projects/My Project');
    });

    it('should handle array values', () => {
        const result = substituteVariables('Projects/{tags}', {
            tags: ['work', 'urgent', 'client'],
        });
        // Arrays are now joined with '/' to create nested folder paths
        expect(result.substitutedPath).toBe('Projects/work/urgent/client');
    });

    it('should handle array values with sanitization', () => {
        const result = substituteVariables('Projects/{tags}', {
            tags: ['work/', 'urgent<>', 'client:'],
        });
        // Arrays are now joined with '/' to create nested folder paths
        expect(result.substitutedPath).toBe('Projects/work-/urgent/client');
    });

    it('should handle empty array', () => {
        const result = substituteVariables('Projects/{tags}', {
            tags: [],
        });
        expect(result.substitutedPath).toBe('Projects');
    });

    it('should filter out empty values in arrays', () => {
        const result = substituteVariables('Projects/{tags}', {
            tags: ['work', '', null, 'urgent'],
        });
        // Arrays are now joined with '/' to create nested folder paths
        expect(result.substitutedPath).toBe('Projects/work/urgent');
    });

    it('should handle null value', () => {
        const result = substituteVariables('Projects/{project}', {
            project: null,
        });
        expect(result.substitutedPath).toBe('Projects');
        expect(result.missing).toEqual(['project']);
    });

    it('should handle undefined value', () => {
        const result = substituteVariables('Projects/{project}', {
            project: undefined,
        });
        expect(result.substitutedPath).toBe('Projects');
        expect(result.missing).toEqual(['project']);
    });

    it('should handle number values', () => {
        const result = substituteVariables('Archive/{year}/{month}', {
            year: 2024,
            month: 12,
        });
        expect(result.substitutedPath).toBe('Archive/2024/12');
    });

    it('should handle boolean values', () => {
        const result = substituteVariables('Projects/{completed}', {
            completed: true,
        });
        expect(result.substitutedPath).toBe('Projects/true');
    });

    it('should clean up consecutive slashes', () => {
        const result = substituteVariables('Projects/{category}/{subcategory}/{project}', {
            project: 'Website',
        });
        expect(result.substitutedPath).toBe('Projects/Website');
    });

    it('should clean up leading slashes', () => {
        const result = substituteVariables('/{project}', {
            project: 'Website',
        });
        expect(result.substitutedPath).toBe('Website');
    });

    it('should clean up trailing slashes', () => {
        const result = substituteVariables('Projects/{project}/', {
            project: 'Website',
        });
        expect(result.substitutedPath).toBe('Projects/Website');
    });

    it('should filter out empty path segments', () => {
        const result = substituteVariables('Projects//{project}//Folder', {
            project: 'Website',
        });
        expect(result.substitutedPath).toBe('Projects/Website/Folder');
    });

    it('should handle variables with special regex characters (dots for nested access)', () => {
        // Variables with dots now use nested property access
        const result = substituteVariables('Projects/{project.name}', {
            project: { name: 'Website' },
        });
        expect(result.substitutedPath).toBe('Projects/Website');
    });

    it('should handle variables with underscores and hyphens', () => {
        const result = substituteVariables('Projects/{project_name}/{file-type}', {
            project_name: 'Website',
            'file-type': 'Document',
        });
        expect(result.substitutedPath).toBe('Projects/Website/Document');
    });

    it('should handle duplicate variable references', () => {
        const result = substituteVariables('{project}/{project}', {
            project: 'Website',
        });
        expect(result.substitutedPath).toBe('Website/Website');
    });

    it('should handle complex path with multiple variables', () => {
        const result = substituteVariables('Archive/{year}/{month}/{day}/{project}', {
            year: 2024,
            month: 'January',
            day: 15,
            project: 'Daily Notes',
        });
        expect(result.substitutedPath).toBe('Archive/2024/January/15/Daily Notes');
    });

    it('should handle nested property access with dot notation', () => {
        const result = substituteVariables('Authors/{author.name}', {
            author: { name: 'John Doe', email: 'john@example.com' },
        });
        expect(result.substitutedPath).toBe('Authors/John Doe');
        expect(result.substituted).toEqual(['author.name']);
        expect(result.missing).toEqual([]);
    });

    it('should handle deeply nested property access', () => {
        const result = substituteVariables('Data/{meta.location.city}', {
            meta: { location: { city: 'New York', country: 'USA' } },
        });
        expect(result.substitutedPath).toBe('Data/New York');
    });

    it('should report missing nested property', () => {
        const result = substituteVariables('Authors/{author.name}', {
            author: { email: 'john@example.com' },
        });
        expect(result.substitutedPath).toBe('Authors');
        expect(result.missing).toEqual(['author.name']);
    });

    it('should report missing parent property', () => {
        const result = substituteVariables('Authors/{author.name}', {});
        expect(result.substitutedPath).toBe('Authors');
        expect(result.missing).toEqual(['author.name']);
    });

    it('should track invalid variable names in result', () => {
        const result = substituteVariables('Projects/{../evil}/{good}', { good: 'Valid' });
        expect(result.substitutedPath).toBe('Projects/{../evil}/Valid');
        expect(result.invalid).toEqual(['../evil']);
    });
});

describe('validateAndSubstituteDestination', () => {
    it('should validate and substitute valid path', () => {
        const cache: CachedMetadata = {
            frontmatter: {
                project: 'Website',
            },
        };

        const result = validateAndSubstituteDestination('Projects/{project}', cache);
        expect(result.valid).toBe(true);
        expect(result.substitutionResult.substitutedPath).toBe('Projects/Website');
        expect(result.warnings).toEqual([]);
    });

    it('should add warning for missing variables', () => {
        const cache: CachedMetadata = {
            frontmatter: {},
        };

        const result = validateAndSubstituteDestination('Projects/{project}', cache);
        expect(result.warnings).toContain('Missing frontmatter variables: project');
    });

    it('should handle null cache', () => {
        const result = validateAndSubstituteDestination('Projects/{project}', null);
        expect(result.substitutionResult.missing).toEqual(['project']);
    });

    it('should handle cache without frontmatter', () => {
        const cache: CachedMetadata = {};

        const result = validateAndSubstituteDestination('Projects/{project}', cache);
        expect(result.substitutionResult.missing).toEqual(['project']);
    });

    it('should validate invalid path after substitution', () => {
        const cache: CachedMetadata = {
            frontmatter: {
                project: '',
            },
        };

        const result = validateAndSubstituteDestination('Projects/{project}', cache);
        // Empty project will result in just "Projects" which should be valid
        expect(result.valid).toBe(true);
    });

    it('should handle multiple missing variables', () => {
        const cache: CachedMetadata = {
            frontmatter: {
                project: 'Website',
            },
        };

        const result = validateAndSubstituteDestination('Projects/{project}/{status}/{priority}', cache);
        expect(result.warnings).toContain('Missing frontmatter variables: status, priority');
    });

    it('should combine validation warnings with missing variable warnings', () => {
        const cache: CachedMetadata = {
            frontmatter: {},
        };

        const result = validateAndSubstituteDestination('Projects/{project}', cache);
        expect(result.warnings?.length).toBeGreaterThan(0);
    });
});

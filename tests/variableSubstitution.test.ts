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
        expect(result).toEqual(['project']);
    });

    it('should extract multiple variables', () => {
        const result = extractVariables('Projects/{project}/{status}');
        expect(result).toEqual(['project', 'status']);
    });

    it('should return empty array when no variables', () => {
        const result = extractVariables('Projects/Fixed');
        expect(result).toEqual([]);
    });

    it('should handle variables with spaces', () => {
        const result = extractVariables('{project name}/{status code}');
        expect(result).toEqual(['project name', 'status code']);
    });

    it('should handle duplicate variables', () => {
        const result = extractVariables('{project}/{project}');
        expect(result).toEqual(['project', 'project']);
    });

    it('should handle nested braces', () => {
        const result = extractVariables('{outer{inner}}');
        expect(result).toEqual(['outer{inner']);
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
        expect(result.substitutedPath).toBe('Projects/work,urgent,client');
    });

    it('should handle array values with sanitization', () => {
        const result = substituteVariables('Projects/{tags}', {
            tags: ['work/', 'urgent<>', 'client:'],
        });
        expect(result.substitutedPath).toBe('Projects/work-,urgent,client');
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
        expect(result.substitutedPath).toBe('Projects/work,urgent');
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

    it('should handle variables with special regex characters', () => {
        const result = substituteVariables('Projects/{project.name}', {
            'project.name': 'Website',
        });
        expect(result.substitutedPath).toBe('Projects/Website');
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

/**
 * Unit tests for path sanitization and validation.
 */

import {
	validatePath,
	sanitizePath,
	isValidPath,
	validateDestinationPath,
	safeJoinPath,
} from '../src/pathSanitization';
import { InvalidPathError } from '../src/errors';

describe('Path Sanitization and Validation', () => {
	describe('validatePath', () => {
		describe('empty paths', () => {
			it('should reject empty paths by default', () => {
				const result = validatePath('');
				expect(result.valid).toBe(false);
				expect(result.error).toBeInstanceOf(InvalidPathError);
				expect(result.error?.reason).toBe('empty');
			});

			it('should reject whitespace-only paths', () => {
				const result = validatePath('   ');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('empty');
			});

			it('should allow empty paths when configured', () => {
				const result = validatePath('', { allowEmpty: true });
				expect(result.valid).toBe(true);
				expect(result.sanitizedPath).toBe('');
			});
		});

		describe('absolute paths', () => {
			it('should reject Unix absolute paths by default', () => {
				const result = validatePath('/etc/passwd');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('absolute');
			});

			it('should reject Windows absolute paths by default', () => {
				const paths = ['C:\\Windows', 'D:/Documents', 'C:\\'];
				paths.forEach((path) => {
					const result = validatePath(path);
					expect(result.valid).toBe(false);
					expect(result.error?.reason).toBe('absolute');
				});
			});

			it('should allow absolute paths when configured', () => {
				const result = validatePath('/etc/passwd', { allowAbsolute: true });
				expect(result.valid).toBe(true);
			});
		});

		describe('path traversal', () => {
			it('should reject path traversal attempts', () => {
				const paths = ['../etc/passwd', 'folder/../../../etc', './../../test', 'test/../..'];
				paths.forEach((path) => {
					const result = validatePath(path);
					expect(result.valid).toBe(false);
					expect(result.error?.reason).toBe('traversal');
				});
			});

			it('should reject hidden path traversal with slashes', () => {
				const result = validatePath('folder/../../outside');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('traversal');
			});
		});

		describe('invalid characters', () => {
			it('should reject paths with Windows-invalid characters', () => {
				const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
				invalidChars.forEach((char) => {
					const path = `test${char}file.md`;
					const result = validatePath(path);
					expect(result.valid).toBe(false);
					expect(result.error?.reason).toBe('invalid-characters');
				});
			});

			it('should reject paths with control characters', () => {
				const result = validatePath('test\x00file.md');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('invalid-characters');
			});

			it('should allow valid special characters', () => {
				const validPaths = [
					'test-file.md',
					'test_file.md',
					'test.file.md',
					'test (copy).md',
					'test [1].md',
					'test & file.md',
				];

				validPaths.forEach((path) => {
					const result = validatePath(path);
					expect(result.valid).toBe(true);
				});
			});
		});

		describe('path length limits', () => {
			it('should reject paths exceeding the maximum length', () => {
				const longPath = 'a'.repeat(300);
				const result = validatePath(longPath, { maxLength: 260 });
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('too-long');
			});

			it('should reject path components exceeding 255 characters', () => {
				const longComponent = 'a'.repeat(256);
				const result = validatePath(`folder/${longComponent}.md`);
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('too-long');
			});

			it('should allow paths within the limit', () => {
				const validPath = 'a'.repeat(200);
				const result = validatePath(validPath, { maxLength: 260 });
				expect(result.valid).toBe(true);
			});

			it('should respect custom max length', () => {
				const path = 'a'.repeat(100);
				const result = validatePath(path, { maxLength: 50 });
				expect(result.valid).toBe(false);
			});
		});

		describe('Windows reserved names', () => {
			it('should reject Windows reserved filenames', () => {
				const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
				reserved.forEach((name) => {
					const result = validatePath(name);
					expect(result.valid).toBe(false);
					expect(result.error?.reason).toBe('reserved-name');
				});
			});

			it('should reject reserved names with extensions', () => {
				const result = validatePath('CON.txt');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('reserved-name');
			});

			it('should reject reserved names in subdirectories', () => {
				const result = validatePath('folder/CON/file.md');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('reserved-name');
			});

			it('should be case-insensitive for reserved names', () => {
				const result = validatePath('con.txt');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('reserved-name');
			});

			it('should allow checking to be disabled', () => {
				const result = validatePath('CON.txt', { checkReservedNames: false });
				expect(result.valid).toBe(true);
			});

			it('should allow non-reserved names that contain reserved strings', () => {
				const result = validatePath('console.log');
				expect(result.valid).toBe(true);
			});
		});

		describe('trailing dots and spaces', () => {
			it('should reject path components ending with dots', () => {
				const result = validatePath('folder./file.md');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('invalid-characters');
			});

			it('should reject path components ending with spaces', () => {
				const result = validatePath('folder /file.md');
				expect(result.valid).toBe(false);
				expect(result.error?.reason).toBe('invalid-characters');
			});

			it('should allow dots in the middle of filenames', () => {
				const result = validatePath('my.file.name.md');
				expect(result.valid).toBe(true);
			});
		});

		describe('multiple slashes', () => {
			it('should normalize multiple consecutive slashes', () => {
				const result = validatePath('folder//subfolder///file.md');
				expect(result.valid).toBe(true);
				expect(result.sanitizedPath).toBe('folder/subfolder/file.md');
				expect(result.warnings).toBeDefined();
			});

			it('should normalize backslashes to forward slashes', () => {
				const result = validatePath('folder\\\\subfolder\\\\file.md');
				expect(result.valid).toBe(true);
			});
		});

		describe('path sanitization', () => {
			it('should trim trailing slashes', () => {
				const result = validatePath('folder/file.md/');
				expect(result.valid).toBe(true);
				expect(result.sanitizedPath).toBe('folder/file.md');
			});

			it('should trim whitespace', () => {
				const result = validatePath('  folder/file.md  ');
				expect(result.valid).toBe(true);
				expect(result.sanitizedPath).toBe('folder/file.md');
			});

			it('should trim whitespace and slashes together', () => {
				const result = validatePath('  folder/subfolder/  ');
				expect(result.valid).toBe(true);
				expect(result.sanitizedPath).toBe('folder/subfolder');
			});
		});

		describe('valid paths', () => {
			it('should accept normal relative paths', () => {
				const validPaths = [
					'folder/file.md',
					'notes/2024/january/note.md',
					'Archive/old-notes/test.md',
					'file.md',
					'my-folder/my-file.md',
				];

				validPaths.forEach((path) => {
					const result = validatePath(path);
					expect(result.valid).toBe(true);
					expect(result.sanitizedPath).toBeDefined();
				});
			});
		});
	});

	describe('sanitizePath', () => {
		it('should return sanitized path for valid input', () => {
			const sanitized = sanitizePath('folder/file.md');
			expect(sanitized).toBe('folder/file.md');
		});

		it('should throw InvalidPathError for invalid input', () => {
			expect(() => sanitizePath('../etc/passwd')).toThrow(InvalidPathError);
		});

		it('should return normalized path', () => {
			const sanitized = sanitizePath('  /folder//file.md/  ');
			expect(sanitized).toBe('folder/file.md');
		});
	});

	describe('isValidPath', () => {
		it('should return true for valid paths', () => {
			expect(isValidPath('folder/file.md')).toBe(true);
		});

		it('should return false for invalid paths', () => {
			expect(isValidPath('../etc/passwd')).toBe(false);
			expect(isValidPath('')).toBe(false);
			expect(isValidPath('test<>file.md')).toBe(false);
		});

		it('should respect options', () => {
			expect(isValidPath('', { allowEmpty: true })).toBe(true);
			expect(isValidPath('/etc/passwd', { allowAbsolute: true })).toBe(true);
		});
	});

	describe('validateDestinationPath', () => {
		it('should apply strict validation for destinations', () => {
			expect(validateDestinationPath('').valid).toBe(false);
			expect(validateDestinationPath('/absolute').valid).toBe(false);
			expect(validateDestinationPath('../traversal').valid).toBe(false);
		});

		it('should accept valid destination paths', () => {
			const result = validateDestinationPath('Archive/2024');
			expect(result.valid).toBe(true);
			expect(result.sanitizedPath).toBe('Archive/2024');
		});

		it('should check for reserved names', () => {
			const result = validateDestinationPath('CON');
			expect(result.valid).toBe(false);
		});
	});

	describe('safeJoinPath', () => {
		it('should join path segments safely', () => {
			const result = safeJoinPath(['folder', 'subfolder', 'file.md']);
			expect(result.valid).toBe(true);
			expect(result.sanitizedPath).toBe('folder/subfolder/file.md');
		});

		it('should filter out empty segments', () => {
			const result = safeJoinPath(['folder', '', 'subfolder', 'file.md']);
			expect(result.valid).toBe(true);
			expect(result.sanitizedPath).toBe('folder/subfolder/file.md');
		});

		it('should validate the joined result', () => {
			const result = safeJoinPath(['..', 'etc', 'passwd']);
			expect(result.valid).toBe(false);
			expect(result.error?.reason).toBe('traversal');
		});

		it('should respect validation options', () => {
			const result = safeJoinPath([''], { allowEmpty: true });
			expect(result.valid).toBe(true);
		});
	});

	describe('cross-platform compatibility', () => {
		it('should handle both forward and backslashes', () => {
			const paths = [
				'folder/file.md',
				'folder\\file.md',
				'folder\\subfolder/file.md',
			];

			paths.forEach((path) => {
				const result = validatePath(path);
				expect(result.valid).toBe(true);
			});
		});

		it('should normalize all paths to use forward slashes', () => {
			const result = validatePath('folder\\subfolder\\file.md');
			expect(result.sanitizedPath).toContain('/');
			expect(result.sanitizedPath).not.toContain('\\');
		});
	});

	describe('edge cases', () => {
		it('should handle single character paths', () => {
			const result = validatePath('a');
			expect(result.valid).toBe(true);
			expect(result.sanitizedPath).toBe('a');
		});

		it('should handle paths with only dots (but not traversal)', () => {
			// Note: "." is handled as current directory and would be filtered
			const result = validatePath('.');
			// After normalization, "." becomes empty
			expect(result.valid).toBe(false);
		});

		it('should handle Unicode characters in paths', () => {
			const result = validatePath('folder/文件.md');
			expect(result.valid).toBe(true);
		});

		it('should handle paths with spaces', () => {
			const result = validatePath('my folder/my file.md');
			expect(result.valid).toBe(true);
		});
	});
});

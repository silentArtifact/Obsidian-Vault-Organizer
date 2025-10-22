/**
 * Unit tests for error categorization and custom error types.
 */

import {
	VaultOrganizerError,
	PermissionError,
	FileConflictError,
	InvalidPathError,
	FileOperationError,
	categorizeError,
} from '../src/errors';

describe('Custom Error Types', () => {
	describe('PermissionError', () => {
		it('should create a permission error with correct properties', () => {
			const error = new PermissionError('test.md', 'move');

			expect(error).toBeInstanceOf(VaultOrganizerError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('PermissionError');
			expect(error.filePath).toBe('test.md');
			expect(error.operation).toBe('move');
			expect(error.message).toContain('Permission denied');
			expect(error.message).toContain('move');
			expect(error.message).toContain('test.md');
		});

		it('should provide a user-friendly error message', () => {
			const error = new PermissionError('documents/report.md', 'write');
			const userMessage = error.getUserMessage();

			expect(userMessage).toContain('Permission denied');
			expect(userMessage).toContain('write');
			expect(userMessage).toContain('documents/report.md');
			expect(userMessage).toContain('Check file permissions');
		});

		it('should handle all operation types', () => {
			const operations: Array<'read' | 'write' | 'move' | 'delete'> = [
				'read',
				'write',
				'move',
				'delete',
			];

			operations.forEach((op) => {
				const error = new PermissionError('test.md', op);
				expect(error.operation).toBe(op);
				expect(error.getUserMessage()).toContain(op);
			});
		});

		it('should preserve original error', () => {
			const originalError = new Error('EACCES: permission denied');
			const error = new PermissionError('test.md', 'read', originalError);

			expect(error.originalError).toBe(originalError);
		});
	});

	describe('FileConflictError', () => {
		it('should create a file conflict error with correct properties', () => {
			const error = new FileConflictError(
				'source.md',
				'destination.md',
				'exists'
			);

			expect(error).toBeInstanceOf(VaultOrganizerError);
			expect(error.name).toBe('FileConflictError');
			expect(error.sourcePath).toBe('source.md');
			expect(error.destinationPath).toBe('destination.md');
			expect(error.conflictType).toBe('exists');
		});

		it('should provide user-friendly messages for all conflict types', () => {
			const types: Array<'exists' | 'locked' | 'in-use'> = [
				'exists',
				'locked',
				'in-use',
			];

			types.forEach((type) => {
				const error = new FileConflictError('src.md', 'dest.md', type);
				const message = error.getUserMessage();

				expect(message).toContain('src.md');
				expect(message).toContain('dest.md');

				switch (type) {
					case 'exists':
						expect(message).toContain('already exists');
						break;
					case 'locked':
						expect(message).toContain('locked');
						break;
					case 'in-use':
						expect(message).toContain('in use');
						break;
				}
			});
		});
	});

	describe('InvalidPathError', () => {
		it('should create an invalid path error with correct properties', () => {
			const error = new InvalidPathError('../../etc/passwd', 'traversal');

			expect(error).toBeInstanceOf(VaultOrganizerError);
			expect(error.name).toBe('InvalidPathError');
			expect(error.path).toBe('../../etc/passwd');
			expect(error.reason).toBe('traversal');
		});

		it('should provide user-friendly messages for all error reasons', () => {
			const reasons: Array<
				| 'empty'
				| 'absolute'
				| 'traversal'
				| 'invalid-characters'
				| 'too-long'
				| 'reserved-name'
			> = [
				'empty',
				'absolute',
				'traversal',
				'invalid-characters',
				'too-long',
				'reserved-name',
			];

			reasons.forEach((reason) => {
				const error = new InvalidPathError('test/path', reason);
				const message = error.getUserMessage();

				expect(message).toContain('Invalid path');
				expect(message).toBeDefined();
			});
		});

		it('should include additional details in the message', () => {
			const error = new InvalidPathError(
				'test<>file.md',
				'invalid-characters',
				'Contains "<>"'
			);

			const message = error.getUserMessage();
			expect(message).toContain('Contains "<>"');
		});
	});

	describe('FileOperationError', () => {
		it('should create a file operation error with correct properties', () => {
			const error = new FileOperationError('test.md', 'rename');

			expect(error).toBeInstanceOf(VaultOrganizerError);
			expect(error.name).toBe('FileOperationError');
			expect(error.filePath).toBe('test.md');
			expect(error.operation).toBe('rename');
		});

		it('should include original error message in user message', () => {
			const originalError = new Error('Disk full');
			const error = new FileOperationError('test.md', 'write', originalError);
			const message = error.getUserMessage();

			expect(message).toContain('test.md');
			expect(message).toContain('Disk full');
		});
	});

	describe('categorizeError', () => {
		it('should categorize permission errors', () => {
			const testCases = [
				'permission denied',
				'EACCES: access denied',
				'EPERM: operation not permitted',
				'Access denied',
			];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'test.md');

				expect(categorized).toBeInstanceOf(PermissionError);
				expect((categorized as PermissionError).filePath).toBe('test.md');
			});
		});

		it('should categorize file exists errors', () => {
			const testCases = [
				'file already exists',
				'EEXIST: file exists',
				'File exists at destination',
			];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'src.md', 'dest.md');

				expect(categorized).toBeInstanceOf(FileConflictError);
				const conflict = categorized as FileConflictError;
				expect(conflict.sourcePath).toBe('src.md');
				expect(conflict.destinationPath).toBe('dest.md');
				expect(conflict.conflictType).toBe('exists');
			});
		});

		it('should categorize locked file errors', () => {
			const testCases = ['file is locked', 'EBUSY: resource busy'];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'test.md', 'dest.md');

				expect(categorized).toBeInstanceOf(FileConflictError);
				expect((categorized as FileConflictError).conflictType).toBe('locked');
			});
		});

		it('should categorize file in use errors', () => {
			const testCases = [
				'file in use',
				'file is being used',
				'ETXTBSY: text file busy',
			];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'test.md', 'dest.md');

				expect(categorized).toBeInstanceOf(FileConflictError);
				expect((categorized as FileConflictError).conflictType).toBe('in-use');
			});
		});

		it('should categorize invalid path errors', () => {
			const testCases = [
				'invalid path',
				'invalid character in filename',
				'EINVAL: invalid argument',
			];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'test.md', 'bad<>path.md');

				expect(categorized).toBeInstanceOf(InvalidPathError);
				const pathError = categorized as InvalidPathError;
				expect(pathError.path).toBe('bad<>path.md');
				expect(pathError.reason).toBe('invalid-characters');
			});
		});

		it('should categorize path too long errors', () => {
			const testCases = ['path too long', 'ENAMETOOLONG: file name too long'];

			testCases.forEach((msg) => {
				const error = new Error(msg);
				const categorized = categorizeError(error, 'test.md', 'very/long/path.md');

				expect(categorized).toBeInstanceOf(InvalidPathError);
				expect((categorized as InvalidPathError).reason).toBe('too-long');
			});
		});

		it('should fall back to FileOperationError for unknown errors', () => {
			const error = new Error('Unknown error occurred');
			const categorized = categorizeError(error, 'test.md');

			expect(categorized).toBeInstanceOf(FileOperationError);
			const opError = categorized as FileOperationError;
			expect(opError.filePath).toBe('test.md');
			expect(opError.operation).toBe('move');
		});

		it('should handle non-Error objects', () => {
			const error = 'String error message';
			const categorized = categorizeError(error, 'test.md');

			expect(categorized).toBeInstanceOf(FileOperationError);
		});

		it('should handle null/undefined destination paths', () => {
			const error = new Error('permission denied');
			const categorized = categorizeError(error, 'test.md');

			expect(categorized).toBeInstanceOf(PermissionError);
			expect((categorized as PermissionError).filePath).toBe('test.md');
		});

		it('should be case-insensitive when matching error messages', () => {
			const error = new Error('PERMISSION DENIED');
			const categorized = categorizeError(error, 'test.md');

			expect(categorized).toBeInstanceOf(PermissionError);
		});
	});
});

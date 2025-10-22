/**
 * Custom error types for the Obsidian Vault Organizer plugin.
 * Provides specific error categorization for better error handling and user feedback.
 */

/**
 * Base class for all Vault Organizer errors.
 */
export abstract class VaultOrganizerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Returns a user-friendly error message suitable for display in Obsidian notices.
	 */
	abstract getUserMessage(): string;
}

/**
 * Error thrown when a file operation fails due to insufficient permissions.
 */
export class PermissionError extends VaultOrganizerError {
	constructor(
		public readonly filePath: string,
		public readonly operation: 'read' | 'write' | 'move' | 'delete',
		public readonly originalError?: Error
	) {
		super(`Permission denied: Cannot ${operation} file "${filePath}"`);
	}

	getUserMessage(): string {
		return `Permission denied: Cannot ${this.operation} "${this.filePath}". Check file permissions and try again.`;
	}
}

/**
 * Error thrown when a file operation fails due to a conflict (e.g., destination file already exists).
 */
export class FileConflictError extends VaultOrganizerError {
	constructor(
		public readonly sourcePath: string,
		public readonly destinationPath: string,
		public readonly conflictType: 'exists' | 'locked' | 'in-use',
		public readonly originalError?: Error
	) {
		super(
			`File conflict: Cannot move "${sourcePath}" to "${destinationPath}" - file ${conflictType}`
		);
	}

	getUserMessage(): string {
		const reasons = {
			exists: 'a file already exists at that location',
			locked: 'the destination file is locked',
			'in-use': 'the destination file is currently in use',
		};
		return `Cannot move "${this.sourcePath}" to "${this.destinationPath}": ${reasons[this.conflictType]}.`;
	}
}

/**
 * Error thrown when a path is invalid or doesn't meet OS compatibility requirements.
 */
export class InvalidPathError extends VaultOrganizerError {
	constructor(
		public readonly path: string,
		public readonly reason:
			| 'empty'
			| 'absolute'
			| 'traversal'
			| 'invalid-characters'
			| 'too-long'
			| 'reserved-name',
		public readonly details?: string
	) {
		super(`Invalid path "${path}": ${reason}${details ? ` - ${details}` : ''}`);
	}

	getUserMessage(): string {
		const reasons = {
			empty: 'Path cannot be empty',
			absolute: 'Absolute paths are not allowed',
			traversal: 'Path traversal (../) is not allowed',
			'invalid-characters': 'Path contains invalid characters',
			'too-long': 'Path is too long',
			'reserved-name': 'Path uses a reserved system name',
		};

		const message = reasons[this.reason];
		const extra = this.details ? ` (${this.details})` : '';
		return `Invalid path "${this.path}": ${message}${extra}.`;
	}
}

/**
 * Error thrown when a file operation fails but doesn't fit into specific categories.
 */
export class FileOperationError extends VaultOrganizerError {
	constructor(
		public readonly filePath: string,
		public readonly operation: string,
		public readonly originalError?: Error
	) {
		super(`File operation failed: ${operation} on "${filePath}"`);
	}

	getUserMessage(): string {
		const errorDetails = this.originalError?.message
			? `: ${this.originalError.message}`
			: '';
		return `Failed to ${this.operation} "${this.filePath}"${errorDetails}.`;
	}
}

/**
 * Categorizes a generic error into a specific error type based on error message patterns.
 * This is useful for handling errors from Obsidian's API which may not provide specific error types.
 */
export function categorizeError(
	error: unknown,
	filePath: string,
	destinationPath?: string
): VaultOrganizerError {
	const err = error instanceof Error ? error : new Error(String(error));
	const message = err.message.toLowerCase();

	// Permission errors
	if (
		message.includes('permission') ||
		message.includes('eacces') ||
		message.includes('eperm') ||
		message.includes('access denied')
	) {
		return new PermissionError(filePath, 'move', err);
	}

	// File conflict errors
	if (
		message.includes('already exists') ||
		message.includes('eexist') ||
		message.includes('file exists')
	) {
		return new FileConflictError(
			filePath,
			destinationPath || filePath,
			'exists',
			err
		);
	}

	if (message.includes('locked') || message.includes('ebusy')) {
		return new FileConflictError(
			filePath,
			destinationPath || filePath,
			'locked',
			err
		);
	}

	if (
		message.includes('in use') ||
		message.includes('being used') ||
		message.includes('etxtbsy')
	) {
		return new FileConflictError(
			filePath,
			destinationPath || filePath,
			'in-use',
			err
		);
	}

	// Path validation errors
	if (
		message.includes('invalid path') ||
		message.includes('invalid character') ||
		message.includes('einval')
	) {
		return new InvalidPathError(destinationPath || filePath, 'invalid-characters');
	}

	if (message.includes('path too long') || message.includes('enametoolong')) {
		return new InvalidPathError(destinationPath || filePath, 'too-long');
	}

	// Generic file operation error
	return new FileOperationError(filePath, 'move', err);
}

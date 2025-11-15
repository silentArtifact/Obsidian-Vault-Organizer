/**
 * Custom error types for the Obsidian Vault Organizer plugin.
 * Provides specific error categorization for better error handling and user feedback.
 */

/**
 * Base class for all Vault Organizer errors.
 * Provides consistent error handling with user-friendly messages and proper stack traces.
 */
export abstract class VaultOrganizerError extends Error {
	/**
	 * Creates a new VaultOrganizerError.
	 *
	 * @param message - The technical error message for logging and debugging
	 */
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
 * Indicates the user or process lacks the necessary permissions to access or modify the file.
 */
export class PermissionError extends VaultOrganizerError {
        /**
         * Creates a new PermissionError.
         *
         * @param filePath - The path to the file that caused the permission error
         * @param operation - The operation that was attempted (e.g., 'move', 'read', 'write')
         * @param originalError - The original error that triggered this permission error, if any
         */
        constructor(
                public readonly filePath: string,
                public readonly operation: string,
                public readonly originalError?: Error
        ) {
                const friendlyOperation = formatOperationForMessage(operation);
                super(`Permission denied: Cannot ${friendlyOperation} "${filePath}"`);
        }

        /**
         * Returns a user-friendly error message suitable for display in Obsidian notices.
         * Includes the file path, operation, and actionable advice.
         *
         * @returns A formatted error message string
         */
        getUserMessage(): string {
                const friendlyOperation = formatOperationForMessage(this.operation);
                return `Permission denied: Cannot ${friendlyOperation} "${this.filePath}". Check file permissions and try again.`;
        }
}

/**
 * Error thrown when a file operation fails due to a conflict.
 * Covers cases like existing files, locked files, files currently in use, or excessive conflicts.
 */
export class FileConflictError extends VaultOrganizerError {
        /**
         * Creates a new FileConflictError.
         *
         * @param sourcePath - The path to the source file being operated on
         * @param destinationPath - The destination path if applicable (e.g., for move operations)
         * @param conflictType - The type of conflict: 'exists' (file already exists), 'locked' (file is locked), 'in-use' (file is being used), or 'too-many-conflicts' (conflict resolution exceeded max attempts)
         * @param operation - The operation that was attempted (e.g., 'move', 'copy', 'create')
         * @param originalError - The original error that triggered this conflict error, if any
         */
        constructor(
                public readonly sourcePath: string,
                public readonly destinationPath: string | undefined,
                public readonly conflictType: 'exists' | 'locked' | 'in-use' | 'too-many-conflicts',
                public readonly operation: string,
                public readonly originalError?: Error | string
        ) {
                const friendlyOperation = formatOperationForMessage(operation);
                const baseMessage = destinationPath
                        ? `Cannot ${friendlyOperation} "${sourcePath}" to "${destinationPath}"`
                        : `Cannot ${friendlyOperation} "${sourcePath}"`;
                super(`File conflict: ${baseMessage} - file ${conflictType}`);
        }

        /**
         * Returns a user-friendly error message suitable for display in Obsidian notices.
         * Provides specific details about the conflict type and involved files.
         *
         * @returns A formatted error message string
         */
        getUserMessage(): string {
                const reasons = {
                        exists: 'a file already exists at that location',
                        locked: 'the destination file is locked',
                        'in-use': 'the destination file is currently in use',
                        'too-many-conflicts': typeof this.originalError === 'string'
                                ? this.originalError
                                : 'too many filename conflicts encountered',
                };
                const friendlyOperation = formatOperationForMessage(this.operation);
                const baseMessage = this.destinationPath
                        ? `Cannot ${friendlyOperation} "${this.sourcePath}" to "${this.destinationPath}"`
                        : `Cannot ${friendlyOperation} "${this.sourcePath}"`;
                return `${baseMessage}: ${reasons[this.conflictType]}.`;
        }
}

/**
 * Error thrown when a path is invalid or doesn't meet OS compatibility requirements.
 * Validates paths for security (no traversal), OS constraints (character limits, reserved names),
 * and general validity (non-empty, relative paths only).
 */
export class InvalidPathError extends VaultOrganizerError {
	/**
	 * Creates a new InvalidPathError.
	 *
	 * @param path - The invalid path that was provided
	 * @param reason - The reason why the path is invalid
	 * @param details - Optional additional details about the validation failure
	 */
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

	/**
	 * Returns a user-friendly error message suitable for display in Obsidian notices.
	 * Explains why the path is invalid and provides the specific reason.
	 *
	 * @returns A formatted error message string
	 */
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
 * Error thrown when a file operation fails but doesn't fit into specific categories
 * like permissions, conflicts, or path validation issues. Used as a generic fallback
 * for unexpected file system errors.
 */
export class FileOperationError extends VaultOrganizerError {
        /**
         * Creates a new FileOperationError.
         *
         * @param filePath - The path to the file that was being operated on
         * @param operation - The operation that failed (e.g., 'move', 'read', 'delete')
         * @param originalError - The original error that caused the operation to fail, if any
         */
        constructor(
                public readonly filePath: string,
                public readonly operation: string,
                public readonly originalError?: Error
        ) {
                const friendlyOperation = formatOperationForMessage(operation);
                super(`File operation failed: ${friendlyOperation} on "${filePath}"`);
        }

        /**
         * Returns a user-friendly error message suitable for display in Obsidian notices.
         * Includes the file path, operation, and original error details if available.
         *
         * @returns A formatted error message string
         */
        getUserMessage(): string {
                const friendlyOperation = formatOperationForMessage(this.operation);
                const errorDetails = this.originalError?.message
                        ? `: ${this.originalError.message}`
                        : '';
                return `Failed to ${friendlyOperation} "${this.filePath}"${errorDetails}.`;
        }
}

/**
 * Categorizes a generic error into a specific error type based on error message patterns.
 * This is useful for handling errors from Obsidian's API which may not provide specific error types.
 */
export function categorizeError(
        error: unknown,
        filePath: string,
        operation: string,
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
                return new PermissionError(filePath, operation, err);
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
                        operation,
                        err
                );
        }

        if (message.includes('locked') || message.includes('ebusy')) {
                return new FileConflictError(
                        filePath,
                        destinationPath || filePath,
                        'locked',
                        operation,
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
                        operation,
                        err
                );
        }

	// Path validation errors
	if (
		message.includes('invalid path') ||
		message.includes('invalid character') ||
		message.includes('einval')
	) {
		return new InvalidPathError(
			destinationPath || filePath,
			'invalid-characters',
			err.message
		);
	}

	if (message.includes('path too long') || message.includes('enametoolong')) {
		return new InvalidPathError(
			destinationPath || filePath,
			'too-long',
			err.message
		);
	}

        // Generic file operation error
        return new FileOperationError(filePath, operation, err);
}

/**
 * Converts operation names from kebab-case to space-separated words for user-friendly messages.
 * For example, 'move-file' becomes 'move file'.
 *
 * @param operation - The operation name to format (e.g., 'move-file', 'read-content')
 * @returns The formatted operation string with spaces instead of hyphens
 */
function formatOperationForMessage(operation: string): string {
        return operation.replace(/-/g, ' ');
}

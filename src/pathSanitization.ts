/**
 * Path sanitization and validation utilities for cross-platform compatibility.
 * Ensures paths are safe and compatible with Windows, macOS, and Linux filesystems.
 *
 * **Validation Boundaries:**
 *
 * - **Public API Functions** (validatePath, validateDestinationPath, sanitizePath, isValidPath):
 *   These functions ALWAYS validate their inputs and return validation results or throw errors.
 *   They are safe to call with untrusted user input.
 *
 * - **Internal Helper Functions** (safeJoinPath with pre-validated segments):
 *   These may assume certain invariants are already met. Check function documentation.
 *
 * - **Obsidian's normalizePath**:
 *   Called internally after our validation to ensure Obsidian-compatible formatting.
 *
 * **Validation Rules:**
 * - No path traversal (../)
 * - No absolute paths (unless explicitly allowed)
 * - No invalid characters for Windows compatibility
 * - Respects maximum path lengths
 * - Checks for Windows reserved names (CON, PRN, etc.)
 * - No trailing dots or spaces in path components
 */

import { normalizePath } from 'obsidian';
import { InvalidPathError } from './errors';
import { PATH_LIMITS } from './config';

/**
 * Reserved filenames on Windows that cannot be used.
 * These are reserved at any directory level and with any extension.
 */
const WINDOWS_RESERVED_NAMES = new Set([
	'CON',
	'PRN',
	'AUX',
	'NUL',
	'COM1',
	'COM2',
	'COM3',
	'COM4',
	'COM5',
	'COM6',
	'COM7',
	'COM8',
	'COM9',
	'LPT1',
	'LPT2',
	'LPT3',
	'LPT4',
	'LPT5',
	'LPT6',
	'LPT7',
	'LPT8',
	'LPT9',
]);

/**
 * Characters that are invalid in filenames on Windows.
 * We validate against Windows as it's the most restrictive.
 */
// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"|?*\x00-\x1F]/;

/**
 * Pattern to detect absolute paths (Windows and Unix).
 */
const ABSOLUTE_PATH_PATTERN = /^([A-Za-z]:[\\/]|\/)/;

/**
 * Pattern to detect path traversal attempts.
 */
const PATH_TRAVERSAL_PATTERN = /(^|[\\/])\.\.($|[\\/])/;

/**
 * Pattern to detect multiple consecutive slashes.
 */
const MULTIPLE_SLASHES_PATTERN = /\/{2,}|\\{2,}/;

/**
 * Configuration options for path validation.
 */
export interface PathValidationOptions {
	/**
	 * Whether to allow empty paths (default: false).
	 */
	allowEmpty?: boolean;

	/**
	 * Whether to allow absolute paths (default: false).
	 */
	allowAbsolute?: boolean;

	/**
	 * Maximum path length to enforce (default: 260 for Windows compatibility).
	 */
	maxLength?: number;

	/**
	 * Whether to check for Windows reserved names (default: true).
	 */
	checkReservedNames?: boolean;
}

/**
 * Result of path validation.
 */
export interface PathValidationResult {
	/**
	 * Whether the path is valid.
	 */
	valid: boolean;

	/**
	 * The sanitized/normalized path if valid.
	 */
	sanitizedPath?: string;

	/**
	 * Error if the path is invalid.
	 */
	error?: InvalidPathError;

	/**
	 * Warning messages for non-critical issues.
	 */
	warnings?: string[];
}

/**
 * Validates and sanitizes a file path for cross-platform compatibility.
 *
 * @param path - The path to validate
 * @param options - Validation options
 * @returns Validation result with sanitized path or error
 */
export function validatePath(
	path: string,
	options: PathValidationOptions = {}
): PathValidationResult {
	const {
		allowEmpty = false,
		allowAbsolute = false,
		maxLength = PATH_LIMITS.WINDOWS_MAX_PATH,
		checkReservedNames = true,
	} = options;

	const warnings: string[] = [];

	// Check for empty path
	if (!path || path.trim().length === 0) {
		if (!allowEmpty) {
			return {
				valid: false,
				error: new InvalidPathError(path, 'empty'),
			};
		}
		return { valid: true, sanitizedPath: '', warnings };
	}

	// Check for absolute path
	if (ABSOLUTE_PATH_PATTERN.test(path)) {
		if (!allowAbsolute) {
			return {
				valid: false,
				error: new InvalidPathError(
					path,
					'absolute',
					'Use relative paths within the vault'
				),
			};
		}
	}

	// Check for path traversal
	if (PATH_TRAVERSAL_PATTERN.test(path)) {
		return {
			valid: false,
			error: new InvalidPathError(
				path,
				'traversal',
				'Paths cannot contain ".." segments'
			),
		};
	}

	// Normalize the path using Obsidian's utility
	let sanitized = normalizePath(path);

	// Remove multiple consecutive slashes
	if (MULTIPLE_SLASHES_PATTERN.test(sanitized)) {
		sanitized = sanitized.replace(/\/{2,}/g, '/').replace(/\\{2,}/g, '/');
		warnings.push('Multiple consecutive slashes were normalized');
	}

	// Trim leading/trailing whitespace and slashes
	sanitized = sanitized.trim().replace(/^\/+|\/+$/g, '');

	// Check for invalid characters
	const invalidMatch = sanitized.match(INVALID_FILENAME_CHARS);
	if (invalidMatch) {
		return {
			valid: false,
			error: new InvalidPathError(
				path,
				'invalid-characters',
				`Contains invalid character: "${invalidMatch[0]}"`
			),
		};
	}

	// Check path length
	if (sanitized.length > maxLength) {
		return {
			valid: false,
			error: new InvalidPathError(
				path,
				'too-long',
				`Path length (${sanitized.length}) exceeds maximum (${maxLength})`
			),
		};
	}

	// Check each path component
	const components = sanitized.split('/').filter(Boolean);
	for (const component of components) {
		// Check component length
		if (component.length > PATH_LIMITS.MAX_COMPONENT_LENGTH) {
			return {
				valid: false,
				error: new InvalidPathError(
					path,
					'too-long',
					`Path component "${component}" exceeds ${PATH_LIMITS.MAX_COMPONENT_LENGTH} characters`
				),
			};
		}

		// Check for reserved names (Windows)
		if (checkReservedNames) {
			const nameWithoutExt = component.split('.')[0].toUpperCase();
			if (WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
				return {
					valid: false,
					error: new InvalidPathError(
						path,
						'reserved-name',
						`"${component}" is a reserved system name on Windows`
					),
				};
			}
		}

		// Check for trailing dots or spaces (invalid on Windows)
		if (component.endsWith('.') || component.endsWith(' ')) {
			return {
				valid: false,
				error: new InvalidPathError(
					path,
					'invalid-characters',
					`Path component "${component}" cannot end with a dot or space`
				),
			};
		}
	}

	return {
		valid: true,
		sanitizedPath: sanitized,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/**
 * Sanitizes a path and throws an error if invalid.
 * Convenience function for when you want to throw on invalid paths.
 *
 * @param path - The path to sanitize
 * @param options - Validation options
 * @returns The sanitized path
 * @throws {InvalidPathError} If the path is invalid
 */
export function sanitizePath(
	path: string,
	options: PathValidationOptions = {}
): string {
	const result = validatePath(path, options);
	if (!result.valid || !result.sanitizedPath) {
		throw result.error || new InvalidPathError(path, 'invalid-characters', 'Path validation failed');
	}
	return result.sanitizedPath;
}

/**
 * Checks if a path is safe to use without throwing an error.
 *
 * @param path - The path to check
 * @param options - Validation options
 * @returns True if the path is valid, false otherwise
 */
export function isValidPath(
	path: string,
	options: PathValidationOptions = {}
): boolean {
	return validatePath(path, options).valid;
}

/**
 * Sanitizes a destination path for file operations.
 * Applies stricter validation suitable for destination paths.
 *
 * @param destination - The destination path
 * @returns Validation result
 */
export function validateDestinationPath(destination: string): PathValidationResult {
	return validatePath(destination, {
		allowEmpty: false,
		allowAbsolute: false,
		checkReservedNames: true,
	});
}

/**
 * Joins path segments safely, validating the result.
 *
 * @param segments - Path segments to join
 * @param options - Validation options
 * @returns Validation result with joined path
 */
export function safeJoinPath(
	segments: string[],
	options: PathValidationOptions = {}
): PathValidationResult {
	const joined = segments.filter(Boolean).join('/');
	return validatePath(joined, options);
}

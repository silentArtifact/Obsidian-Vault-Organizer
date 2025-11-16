/**
 * Shared path validation helper functions.
 * Centralizes duplicate validation logic used across the codebase.
 */

import { validateDestinationPath, validatePath } from './pathSanitization';
import { substituteVariables } from './variableSubstitution';
import type { SubstitutionResult } from './variableSubstitution';
import { InvalidPathError } from './errors';

/**
 * Result of validating and preparing a destination path.
 */
export interface DestinationValidationResult {
	/** Whether the validation succeeded */
	valid: boolean;
	/** The sanitized destination folder path */
	destinationFolder?: string;
	/** The complete sanitized file path (folder + filename) */
	fullPath?: string;
	/** Variable substitution details */
	substitution?: SubstitutionResult;
	/** Validation error if any */
	error?: InvalidPathError;
	/** Warning messages */
	warnings?: string[];
}

/**
 * Validates and prepares a destination path for a file move operation.
 * This function consolidates the validation logic used in both applyRulesToFile and testAllRules.
 *
 * @param destinationTemplate - The destination path template (may contain {variables})
 * @param fileName - The name of the file being moved
 * @param frontmatter - The frontmatter metadata for variable substitution
 * @returns Validation result with sanitized paths or errors
 */
export function validateAndPrepareDestination(
	destinationTemplate: string,
	fileName: string,
	frontmatter: Record<string, unknown> | undefined
): DestinationValidationResult {
	const warnings: string[] = [];

	// Trim the destination
	const trimmedDestination = destinationTemplate.trim();
	if (!trimmedDestination) {
		return {
			valid: false,
			error: new InvalidPathError(destinationTemplate, 'empty', 'Destination path cannot be empty'),
			warnings,
		};
	}

	// Substitute variables in destination path
	const substitutionResult = substituteVariables(trimmedDestination, frontmatter);

	// Warn about missing variables
	if (substitutionResult.missing.length > 0) {
		warnings.push(`Missing variables: ${substitutionResult.missing.join(', ')}`);
	}

	const destinationWithVariables = substitutionResult.substitutedPath;

	// Validate the destination folder path
	const destinationValidation = validateDestinationPath(destinationWithVariables);
	if (!destinationValidation.valid || !destinationValidation.sanitizedPath) {
		return {
			valid: false,
			substitution: substitutionResult,
			error: destinationValidation.error ?? new InvalidPathError(
				destinationWithVariables,
				'invalid-characters',
				'Destination path validation failed'
			),
			warnings: [...warnings, ...(destinationValidation.warnings ?? [])],
		};
	}

	const destinationFolder = destinationValidation.sanitizedPath;

	// Validate the full destination path (folder + filename)
	const fullPathValidation = validatePath(`${destinationFolder}/${fileName}`, {
		allowEmpty: false,
		allowAbsolute: false,
		checkReservedNames: true,
	});

	if (!fullPathValidation.valid || !fullPathValidation.sanitizedPath) {
		return {
			valid: false,
			substitution: substitutionResult,
			destinationFolder,
			error: fullPathValidation.error ?? new InvalidPathError(
				`${destinationFolder}/${fileName}`,
				'invalid-characters',
				'Full path validation failed'
			),
			warnings: [
				...warnings,
				...(destinationValidation.warnings ?? []),
				...(fullPathValidation.warnings ?? []),
			],
		};
	}

	// Success - return all validated paths
	return {
		valid: true,
		destinationFolder,
		fullPath: fullPathValidation.sanitizedPath,
		substitution: substitutionResult,
		warnings: [
			...warnings,
			...(destinationValidation.warnings ?? []),
			...(fullPathValidation.warnings ?? []),
		].filter(Boolean),
	};
}

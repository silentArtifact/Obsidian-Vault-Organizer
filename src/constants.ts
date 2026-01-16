/**
 * Centralized user-facing strings for the Vault Organizer plugin.
 *
 * This file contains all user-visible text including:
 * - Command names and descriptions
 * - UI labels and placeholders
 * - Tooltips and help text
 * - Notification messages
 * - Error messages (user-friendly versions)
 * - Modal titles and content
 *
 * Benefits of centralization:
 * - Easier to maintain and update text
 * - Consistent messaging across the plugin
 * - Simplified localization if needed in the future
 * - Reduced duplication
 */

/**
 * Command names and descriptions shown in Obsidian's command palette
 */
export const COMMANDS = {
	REORGANIZE: {
		name: 'Reorganize notes based on frontmatter rules',
		description: 'Apply all configured rules to reorganize vault files'
	},
	UNDO: {
		name: 'Undo last automatic move',
		description: 'Revert the most recent file move'
	},
	VIEW_HISTORY: {
		name: 'View move history',
		description: 'Show all recent file moves and undo options'
	}
} as const;

/**
 * Settings UI text (labels, placeholders, tooltips, buttons)
 */
export const SETTINGS_UI = {
	RULE_NAME: 'Frontmatter rule',
	RULE_DESCRIPTION: 'Move files to destination folder based on frontmatter matching',
	EXCLUSION_PATTERNS_NAME: 'Exclusion Patterns',
	EXCLUSION_PATTERNS_DESCRIPTION: 'Files and folders matching these patterns will not be automatically organized',

	TOOLTIPS: {
		ACTIVATE_RULE: 'Activate this rule',
		MOVE_UP: 'Move rule up',
		MOVE_DOWN: 'Move rule down',
		BROWSE_FRONTMATTER: 'Browse frontmatter keys',
		BROWSE_TAGS: 'Browse tags',
		CASE_INSENSITIVE: 'Case insensitive matching',
		DEBUG_MODE: 'Enable debug mode',
		TEST_ALL_RULES: 'Preview what moves would be made without actually moving files',
		CONFLICT_RESOLUTION: 'How to handle file conflicts at destination',
		CONDITION_OPERATOR: 'How to combine multiple conditions (AND/OR)',
		ADD_CONDITION: 'Add another condition to this rule',
		EXCLUSION_PATTERN: 'Glob pattern (e.g., Templates/**, *.excalidraw)',
		DUPLICATE_RULE: 'Create a copy of this rule'
	},

	PLACEHOLDERS: {
		KEY: 'key',
		VALUE: 'value',
		DESTINATION: 'destination folder (supports {variables})',
		FLAGS: 'flags',
		EXCLUSION_PATTERN: 'e.g., Templates/**, Archive/**'
	},

	BUTTONS: {
		REMOVE: 'Remove',
		ADD_RULE: 'Add Rule',
		APPLY_NOW: 'Apply now',
		TEST_ALL_RULES: 'Test All Rules',
		ADD_CONDITION: '+',
		REMOVE_CONDITION: 'Remove Condition',
		ADD_EXCLUSION: 'Add Pattern',
		DUPLICATE: 'Duplicate'
	},

	LABELS: {
		CONFLICT_RESOLUTION: 'On Conflict:',
		CONDITION_OPERATOR: 'Combine:',
		CONDITIONS_SECTION: 'Additional Conditions'
	},

	WARNINGS: {
		INVALID_REGEX: (message: string) => `Invalid regular expression: ${message}`,
		VALUE_REQUIRED: 'Value is required for contains/starts-with/ends-with rules.',
		KEY_REQUIRED: 'Frontmatter key is required for the rule to match.'
	},

	SUCCESS: {
		RULE_VALID: 'Rule is valid and ready to use'
	}
} as const;

/**
 * Modal UI text (titles, labels, messages)
 */
export const MODALS = {
	TEST_ALL_RULES: {
		TITLE: 'Test All Rules - Preview',
		NO_MOVES_OVERALL: 'No files would be moved. All files are either already in the correct location or have no matching rules.',
		NO_MOVES_ALREADY_CORRECT: 'No files would be moved. All matching files are already in the correct location.',
		FILES_WOULD_MOVE: (count: number) => `${count} file(s) would be moved:`,
		SKIPPED_SECTION: 'Skipped due to invalid destinations',
		INVALID_DESTINATION_WARNING: 'Destination path is invalid and the move cannot be previewed.',

		LABELS: {
			FILE: 'File:',
			FROM: 'From:',
			TO: 'To:',
			RULE: 'Rule:',
			WARNINGS: 'Warnings:'
		},

		BUTTONS: {
			CLOSE: 'Close'
		}
	},

	MOVE_HISTORY: {
		TITLE: 'Move History',
		NO_HISTORY: 'No move history yet.',
		SHOWING_COUNT: (current: number, max: number) =>
			`Showing ${current} of last ${max} moves.`,
		MOST_RECENT_PREFIX: '🔄 Most Recent: ',
		TIME_PREFIX: (timeStr: string) => `⏰ ${timeStr}`,

		LABELS: {
			FROM: 'From:',
			TO: 'To:',
			RULE: 'Rule:'
		},

		BUTTONS: {
			UNDO: 'Undo This Move',
			CLEAR_HISTORY: 'Clear History',
			CLOSE: 'Close'
		},

		NOTICES: {
			HISTORY_CLEARED: 'Move history cleared.'
		}
	}
} as const;

/**
 * User-facing notification messages
 */
export const NOTICES = {
	UNDO: {
		NO_MOVES: 'No moves to undo.',
		FILE_NOT_EXISTS: (toPath: string) =>
			`Cannot undo: File no longer exists at ${toPath}`,
		NOT_A_FILE: (toPath: string) =>
			`Cannot undo: ${toPath} is not a file.`,
		DESTINATION_EXISTS: (fromPath: string) =>
			`Cannot undo: A file already exists at ${fromPath}`,
		SUCCESS: (fileName: string, fromPath: string) =>
			`Undone: Moved ${fileName} back to ${fromPath}`
	},

	DEBUG: {
		EMPTY_DESTINATION: (basename: string, vaultName: string) =>
			`DEBUG: ${basename} would not be moved because destination is empty in ${vaultName}.`,
		WOULD_MOVE: (basename: string, vaultName: string, destination: string) =>
			`DEBUG: ${basename} would be moved to ${vaultName}/${destination}`
	},

	REGEX_PARSE_ERROR: (ruleKey: string, message: string) =>
		`Failed to parse regular expression for rule "${ruleKey}": ${message}`
} as const;

/**
 * Internal warning messages for logging
 */
export const WARNINGS = {
	NESTED_BATCH_OPERATION: 'Nested batch operations are not supported. Using existing batch context.',
} as const;

/**
 * Internal error log messages and categories
 */
export const LOG_MESSAGES = {
	FILE_PROCESSING: {
		EXPECTED_ERROR: (errorName: string) => `Expected error during file processing - ${errorName}`,
		UNEXPECTED_ERROR: 'Unexpected error during file processing',
		UNDO_FAILED: 'Undo operation failed',
	},
} as const;

/**
 * Match type option labels for the dropdown
 */
export const MATCH_TYPES = {
	equals: 'Equals',
	contains: 'Contains',
	'starts-with': 'Starts with',
	'ends-with': 'Ends with',
	regex: 'Regex'
} as const;

/**
 * Error messages for user-facing error display
 * These complement the technical error messages in src/errors.ts
 */
export const ERROR_MESSAGES = {
	PERMISSION: {
		READ_DENIED: 'Permission denied when trying to read the file.',
		WRITE_DENIED: 'Permission denied when trying to write to the destination.',
		DELETE_DENIED: 'Permission denied when trying to delete the file.',
		GENERIC: 'You do not have permission to perform this operation.'
	},

	FILE_CONFLICT: {
		ALREADY_EXISTS: 'A file with this name already exists at the destination.',
		WOULD_OVERWRITE: 'Moving this file would overwrite an existing file.',
		GENERIC: 'A file conflict occurred during the operation.'
	},

	INVALID_PATH: {
		EMPTY: 'The path cannot be empty.',
		ABSOLUTE: 'The path must be relative, not absolute.',
		PARENT_REFERENCE: 'The path cannot contain parent directory references (..).',
		INVALID_CHARS: 'The path contains invalid characters.',
		RESERVED_NAME: 'The path uses a reserved system name.',
		TOO_LONG: 'The path exceeds the maximum allowed length.',
		GENERIC: 'The path is invalid.'
	},

	FILE_OPERATION: {
		READ_FAILED: 'Failed to read the file.',
		WRITE_FAILED: 'Failed to write to the file.',
		DELETE_FAILED: 'Failed to delete the file.',
		MOVE_FAILED: 'Failed to move the file.',
		GENERIC: 'The file operation could not be completed.'
	}
} as const;

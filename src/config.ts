/**
 * Configuration constants for the Obsidian Vault Organizer plugin.
 * Centralizes magic numbers and configuration values.
 */

/**
 * Performance and throttling configuration
 */
export const PERFORMANCE_CONFIG = {
	/**
	 * Maximum attempts to find a unique filename before giving up.
	 * Reduced from 1000 to 100 to prevent UI freezing.
	 * If 100 files with the same base name exist, we fall back to timestamp-based naming.
	 */
	MAX_UNIQUE_FILENAME_ATTEMPTS: 100,

	/**
	 * Number of files to process in a batch before yielding to the event loop.
	 * Prevents UI blocking during bulk reorganization operations.
	 */
	BULK_OPERATION_BATCH_SIZE: 100,

	/**
	 * Delay in milliseconds between batches during bulk operations.
	 * Allows the UI to remain responsive during large reorganizations.
	 */
	BULK_OPERATION_BATCH_DELAY_MS: 10,
} as const;

/**
 * UI debouncing configuration
 */
export const DEBOUNCE_CONFIG = {
	/**
	 * Debounce delay in milliseconds for saving settings changes.
	 * Prevents excessive writes when user is rapidly changing settings.
	 */
	SETTINGS_SAVE_MS: 300,

	/**
	 * Debounce delay in milliseconds for refreshing metadata cache.
	 * Higher value to reduce performance impact of frequent metadata updates.
	 */
	METADATA_REFRESH_MS: 1000,
} as const;

/**
 * Path validation limits
 */
export const PATH_LIMITS = {
	/**
	 * Maximum path length for Windows compatibility.
	 * Windows MAX_PATH limit.
	 */
	WINDOWS_MAX_PATH: 260,

	/**
	 * Maximum path length for Unix systems.
	 * PATH_MAX on most Unix systems.
	 */
	UNIX_MAX_PATH: 4096,

	/**
	 * Maximum filename component length.
	 * Common limit across most filesystems.
	 */
	MAX_COMPONENT_LENGTH: 255,

	/**
	 * Maximum array depth when converting frontmatter arrays to nested paths.
	 * Prevents excessively deep folder hierarchies from large arrays.
	 * Example: tags: [a, b, c, d, e] with limit 3 → "a/b/c" (remaining ignored)
	 */
	MAX_ARRAY_PATH_DEPTH: 5,
} as const;

/**
 * UI configuration constants
 */
export const UI_CONFIG = {
	/**
	 * Maximum height for modal result containers
	 */
	MODAL_RESULT_MAX_HEIGHT: '400px',

	/**
	 * Maximum height for modal history containers
	 */
	MODAL_HISTORY_MAX_HEIGHT: '500px',

	/**
	 * Padding for modal result items
	 */
	MODAL_ITEM_PADDING: '0.8em',

	/**
	 * Margin bottom for modal result items
	 */
	MODAL_ITEM_MARGIN_BOTTOM: '1em',

	/**
	 * Margin bottom for header elements
	 */
	MODAL_HEADER_MARGIN_BOTTOM: '0.5em',

	/**
	 * Border radius for modal items
	 */
	MODAL_ITEM_BORDER_RADIUS: '4px',

	/**
	 * Font size for time elements
	 */
	MODAL_TIME_FONT_SIZE: '0.9em',

	/**
	 * Margin top for button containers
	 */
	MODAL_BUTTON_MARGIN_TOP: '1.5em',

	/**
	 * Margin right for buttons
	 */
	MODAL_BUTTON_MARGIN_RIGHT: '0.5em',

	/**
	 * Padding for undo buttons
	 */
	MODAL_UNDO_BUTTON_PADDING: '0.4em 0.8em',
} as const;

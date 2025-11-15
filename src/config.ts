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
	 * Prevents infinite loops when generating unique filenames.
	 */
	MAX_UNIQUE_FILENAME_ATTEMPTS: 1000,

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
} as const;

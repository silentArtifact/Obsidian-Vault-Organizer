/**
 * Structured logging utility for the Obsidian Vault Organizer plugin.
 * Provides consistent logging with context and severity levels.
 */

export enum LogLevel {
	ERROR = 'ERROR',
	WARN = 'WARN',
	INFO = 'INFO',
	DEBUG = 'DEBUG',
}

/**
 * Logger class for structured logging throughout the plugin.
 * Prefixes all log messages with [Vault Organizer] for easy filtering.
 */
export class Logger {
	private static readonly PREFIX = '[Vault Organizer]';

	/**
	 * Logs an error message with optional context.
	 *
	 * @param message - The error message
	 * @param context - Optional context object or error
	 */
	static error(message: string, context?: unknown): void {
		console.error(`${this.PREFIX} ${LogLevel.ERROR}:`, message, context !== undefined ? context : '');
	}

	/**
	 * Logs a warning message with optional context.
	 *
	 * @param message - The warning message
	 * @param context - Optional context object
	 */
	static warn(message: string, context?: unknown): void {
		console.warn(`${this.PREFIX} ${LogLevel.WARN}:`, message, context !== undefined ? context : '');
	}

	/**
	 * Logs an info message with optional context.
	 *
	 * @param message - The info message
	 * @param context - Optional context object
	 */
	static info(message: string, context?: unknown): void {
		console.info(`${this.PREFIX} ${LogLevel.INFO}:`, message, context !== undefined ? context : '');
	}

	/**
	 * Logs a debug message with optional context.
	 * Only enabled in development mode.
	 *
	 * @param message - The debug message
	 * @param context - Optional context object
	 */
	static debug(message: string, context?: unknown): void {
		// Check for development mode with robust environment detection
		// Supports both Node.js and browser environments
		let isDev = false;

		try {
			// Try to access process.env safely
			if (typeof process !== 'undefined' && process?.env) {
				isDev = process.env.NODE_ENV === 'development';
			}
		} catch {
			// If process access fails, assume production
			isDev = false;
		}

		// Alternative: check for common development indicators
		if (!isDev && typeof window !== 'undefined') {
			isDev = window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1';
		}

		if (isDev) {
			console.debug(`${this.PREFIX} ${LogLevel.DEBUG}:`, message, context !== undefined ? context : '');
		}
	}
}

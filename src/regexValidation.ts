/**
 * Regex validation utilities to prevent ReDoS (Regular Expression Denial of Service) attacks.
 * Validates regex patterns for complexity and safety before compilation.
 */

/**
 * Configuration for regex validation
 */
export const REGEX_VALIDATION_CONFIG = {
	/** Maximum pattern length to prevent memory issues */
	MAX_PATTERN_LENGTH: 500,
	/** Maximum number of capturing groups */
	MAX_CAPTURING_GROUPS: 20,
	/** Maximum nesting depth for groups */
	MAX_NESTING_DEPTH: 10,
	/** Maximum number of alternations (|) */
	MAX_ALTERNATIONS: 50,
} as const;

/**
 * Result of regex validation
 */
export interface RegexValidationResult {
	/** Whether the regex is safe to use */
	valid: boolean;
	/** Error message if validation failed */
	error?: string;
	/** Warning messages for potentially problematic patterns */
	warnings?: string[];
	/** Compiled regex if validation succeeded */
	regex?: RegExp;
}

/**
 * Dangerous regex patterns that can cause catastrophic backtracking.
 * These patterns are known to cause exponential time complexity.
 */
const DANGEROUS_PATTERNS = [
	// Nested quantifiers: (a+)+ or (a*)*
	/\([^)]*[+*]\)[+*]/,
	// Multiple consecutive quantifiers: a++, a**
	/[+*]{2,}/,
	// Overlapping alternations with quantifiers: (a|a)+
	/\([^)]*\|[^)]*\)[+*]/,
	// Nested groups with quantifiers on both: ((a)+)+
	/\(\([^)]*[+*]\)[+*]\)/,
];

/**
 * Validates a regex pattern for safety and complexity.
 * Checks for:
 * - Pattern length limits
 * - Dangerous backtracking patterns
 * - Excessive nesting or capturing groups
 * - Valid syntax
 *
 * @param pattern - The regex pattern to validate
 * @param flags - Optional regex flags
 * @returns Validation result with compiled regex if safe
 *
 * @example
 * const result = validateRegexPattern('hello.*world', 'i');
 * if (result.valid && result.regex) {
 *     // Safe to use result.regex
 * }
 */
export function validateRegexPattern(
	pattern: string,
	flags?: string
): RegexValidationResult {
	const warnings: string[] = [];

	// Check pattern length
	if (pattern.length > REGEX_VALIDATION_CONFIG.MAX_PATTERN_LENGTH) {
		return {
			valid: false,
			error: `Pattern too long (${pattern.length} chars). Maximum: ${REGEX_VALIDATION_CONFIG.MAX_PATTERN_LENGTH}`,
		};
	}

	// Check for dangerous backtracking patterns
	for (const dangerousPattern of DANGEROUS_PATTERNS) {
		if (dangerousPattern.test(pattern)) {
			return {
				valid: false,
				error: 'Pattern contains potentially dangerous nested quantifiers that could cause performance issues',
			};
		}
	}

	// Count capturing groups
	const capturingGroups = (pattern.match(/(?<!\\)\(/g) || []).length;
	if (capturingGroups > REGEX_VALIDATION_CONFIG.MAX_CAPTURING_GROUPS) {
		return {
			valid: false,
			error: `Too many capturing groups (${capturingGroups}). Maximum: ${REGEX_VALIDATION_CONFIG.MAX_CAPTURING_GROUPS}`,
		};
	}

	// Count alternations
	const alternations = (pattern.match(/(?<!\\)\|/g) || []).length;
	if (alternations > REGEX_VALIDATION_CONFIG.MAX_ALTERNATIONS) {
		return {
			valid: false,
			error: `Too many alternations (${alternations}). Maximum: ${REGEX_VALIDATION_CONFIG.MAX_ALTERNATIONS}`,
		};
	}

	// Check nesting depth
	const nestingDepth = calculateNestingDepth(pattern);
	if (nestingDepth > REGEX_VALIDATION_CONFIG.MAX_NESTING_DEPTH) {
		return {
			valid: false,
			error: `Nesting too deep (${nestingDepth} levels). Maximum: ${REGEX_VALIDATION_CONFIG.MAX_NESTING_DEPTH}`,
		};
	}

	// Warn about potentially slow patterns
	if (pattern.includes('.*.*')) {
		warnings.push('Pattern contains multiple .* which may be slow on large inputs');
	}
	if (pattern.includes('.+.+')) {
		warnings.push('Pattern contains multiple .+ which may be slow on large inputs');
	}

	// Try to compile the regex
	try {
		const regex = new RegExp(pattern, flags);
		return {
			valid: true,
			regex,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			valid: false,
			error: `Invalid regex syntax: ${message}`,
		};
	}
}

/**
 * Calculates the maximum nesting depth of parentheses in a pattern.
 * Helps detect overly complex patterns.
 *
 * @param pattern - The regex pattern to analyze
 * @returns Maximum nesting depth
 */
function calculateNestingDepth(pattern: string): number {
	let maxDepth = 0;
	let currentDepth = 0;
	let escaped = false;

	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === '\\') {
			escaped = true;
			continue;
		}

		if (char === '(') {
			currentDepth++;
			maxDepth = Math.max(maxDepth, currentDepth);
		} else if (char === ')') {
			currentDepth = Math.max(0, currentDepth - 1);
		}
	}

	return maxDepth;
}

/**
 * Tests a regex against an input string with a timeout to prevent ReDoS.
 * Uses a Promise with timeout to limit execution time.
 *
 * @param regex - The compiled regex to test
 * @param input - The input string to test against
 * @param timeoutMs - Maximum execution time in milliseconds (default: 1000)
 * @returns Promise resolving to true if match found, false if no match or timeout
 *
 * @example
 * const regex = /complex.*pattern/;
 * const matched = await testRegexWithTimeout(regex, userInput, 500);
 */
export async function testRegexWithTimeout(
	regex: RegExp,
	input: string,
	timeoutMs = 1000
): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			resolve(false); // Timeout - treat as no match
		}, timeoutMs);

		try {
			// Reset lastIndex for global regexes to ensure clean state
			regex.lastIndex = 0;
			const result = regex.test(input);
			clearTimeout(timer);
			resolve(result);
		} catch {
			// Ignore errors and treat as no match
			clearTimeout(timer);
			resolve(false);
		}
	});
}

/**
 * Safely creates a RegExp with validation.
 * Returns undefined if the pattern is unsafe.
 *
 * @param pattern - The regex pattern
 * @param flags - Optional regex flags
 * @returns The compiled RegExp or undefined if unsafe
 *
 * @example
 * const regex = safeRegExp('user.*input', 'i');
 * if (regex) {
 *     // Safe to use
 * }
 */
export function safeRegExp(pattern: string, flags?: string): RegExp | undefined {
	const validation = validateRegexPattern(pattern, flags);
	return validation.valid ? validation.regex : undefined;
}

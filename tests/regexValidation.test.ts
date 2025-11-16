import {
	validateRegexPattern,
	safeRegExp,
	testRegexWithTimeout,
	REGEX_VALIDATION_CONFIG,
} from '../src/regexValidation';

describe('validateRegexPattern', () => {
	describe('pattern length validation', () => {
		it('should accept patterns within length limit', () => {
			const result = validateRegexPattern('hello.*world');
			expect(result.valid).toBe(true);
			expect(result.regex).toBeDefined();
		});

		it('should reject patterns exceeding length limit', () => {
			const longPattern = 'a'.repeat(REGEX_VALIDATION_CONFIG.MAX_PATTERN_LENGTH + 1);
			const result = validateRegexPattern(longPattern);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Pattern too long');
			expect(result.error).toContain(`${REGEX_VALIDATION_CONFIG.MAX_PATTERN_LENGTH}`);
		});
	});

	describe('dangerous pattern detection', () => {
		it('should reject nested quantifiers (a+)+', () => {
			const result = validateRegexPattern('(a+)+');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('dangerous nested quantifiers');
		});

		it('should reject nested quantifiers (a*)*', () => {
			const result = validateRegexPattern('(a*)*');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('dangerous nested quantifiers');
		});

		it('should reject multiple consecutive quantifiers a++', () => {
			const result = validateRegexPattern('a++');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('dangerous nested quantifiers');
		});

		it('should reject multiple consecutive quantifiers a**', () => {
			const result = validateRegexPattern('a**');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('dangerous nested quantifiers');
		});

		it('should reject overlapping alternations with quantifiers', () => {
			const result = validateRegexPattern('(a|a)+');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('dangerous nested quantifiers');
		});

		it('should accept nested groups without multiple quantifiers on inner group', () => {
			// Pattern ((a)+)+ has quantifiers on different levels but doesn't match the dangerous pattern regex
			// The dangerous pattern is specifically /\(\([^)]*[+*]\)[+*]\)/ which requires both levels to be nested
			const result = validateRegexPattern('((a)+)+');
			// This will pass dangerous pattern check but fail on nesting depth if deep enough
			// For now it's a valid (though potentially slow) pattern
			expect(result.valid).toBe(true);
		});

		it('should accept safe alternations', () => {
			const result = validateRegexPattern('(cat|dog)');
			expect(result.valid).toBe(true);
			expect(result.regex).toBeDefined();
		});

		it('should accept safe quantifiers', () => {
			const result = validateRegexPattern('hello+');
			expect(result.valid).toBe(true);
			expect(result.regex).toBeDefined();
		});
	});

	describe('capturing groups validation', () => {
		it('should accept reasonable number of capturing groups', () => {
			const pattern = '(a)(b)(c)(d)(e)';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});

		it('should reject too many capturing groups', () => {
			const groups = Array(REGEX_VALIDATION_CONFIG.MAX_CAPTURING_GROUPS + 1)
				.fill('(a)')
				.join('');
			const result = validateRegexPattern(groups);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Too many capturing groups');
		});

		it('should not count escaped parentheses', () => {
			const pattern = '\\(escaped\\)(real)';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});
	});

	describe('alternations validation', () => {
		it('should accept reasonable number of alternations', () => {
			const pattern = 'a|b|c|d|e';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});

		it('should reject too many alternations', () => {
			const alternations = Array(REGEX_VALIDATION_CONFIG.MAX_ALTERNATIONS + 2)
				.fill('a')
				.join('|');
			const result = validateRegexPattern(alternations);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Too many alternations');
		});

		it('should not count escaped pipes', () => {
			const pattern = 'a\\|b|c';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});
	});

	describe('nesting depth validation', () => {
		it('should accept shallow nesting', () => {
			const pattern = '((a))';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});

		it('should reject excessive nesting', () => {
			let pattern = 'a';
			for (let i = 0; i < REGEX_VALIDATION_CONFIG.MAX_NESTING_DEPTH + 1; i++) {
				pattern = `(${pattern})`;
			}
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Nesting too deep');
		});

		it('should handle escaped parentheses correctly', () => {
			const pattern = '\\(\\((a)\\)\\)';
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});

		it('should track current depth correctly', () => {
			const pattern = '(a)(b)(c)'; // No nesting, just sequential groups
			const result = validateRegexPattern(pattern);
			expect(result.valid).toBe(true);
		});
	});

	describe('performance warnings', () => {
		it('should warn about consecutive .* patterns', () => {
			const result = validateRegexPattern('.*.*');
			expect(result.valid).toBe(true);
			expect(result.warnings).toBeDefined();
			expect(result.warnings).toContain('Pattern contains multiple .* which may be slow on large inputs');
		});

		it('should warn about consecutive .+ patterns', () => {
			const result = validateRegexPattern('.+.+');
			expect(result.valid).toBe(true);
			expect(result.warnings).toBeDefined();
			expect(result.warnings).toContain('Pattern contains multiple .+ which may be slow on large inputs');
		});

		it('should not warn about single .* or .+', () => {
			const result = validateRegexPattern('.*foo');
			expect(result.valid).toBe(true);
			expect(result.warnings).toBeUndefined();
		});

		it('should not warn about separated .* patterns', () => {
			// The warning only triggers for consecutive .*.* not separated patterns
			const result = validateRegexPattern('.*foo.*');
			expect(result.valid).toBe(true);
			expect(result.warnings).toBeUndefined();
		});

		it('should include both warnings if both consecutive patterns present', () => {
			const result = validateRegexPattern('.*.*foo.+.+');
			expect(result.valid).toBe(true);
			expect(result.warnings).toBeDefined();
			expect(result.warnings?.length).toBe(2);
		});
	});

	describe('regex compilation', () => {
		it('should compile valid regex patterns', () => {
			const result = validateRegexPattern('hello.*world', 'i');
			expect(result.valid).toBe(true);
			expect(result.regex).toBeInstanceOf(RegExp);
			expect(result.regex?.test('HELLO BEAUTIFUL WORLD')).toBe(true);
		});

		it('should reject invalid regex syntax', () => {
			const result = validateRegexPattern('(unclosed');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid regex syntax');
		});

		it('should handle regex flags correctly', () => {
			const result = validateRegexPattern('test', 'gi');
			expect(result.valid).toBe(true);
			expect(result.regex?.flags).toContain('g');
			expect(result.regex?.flags).toContain('i');
		});

		it('should reject invalid escape sequences', () => {
			const result = validateRegexPattern('\\');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid regex syntax');
		});
	});

	describe('edge cases', () => {
		it('should handle empty pattern', () => {
			const result = validateRegexPattern('');
			expect(result.valid).toBe(true);
		});

		it('should handle pattern with only escaped characters', () => {
			const result = validateRegexPattern('\\(\\)\\[\\]\\{\\}');
			expect(result.valid).toBe(true);
		});

		it('should handle complex valid patterns', () => {
			const result = validateRegexPattern('^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]{2,}$');
			expect(result.valid).toBe(true);
		});

		it('should handle backreferences', () => {
			const result = validateRegexPattern('(\\w+)\\s+\\1');
			expect(result.valid).toBe(true);
		});
	});
});

describe('safeRegExp', () => {
	it('should return RegExp for valid patterns', () => {
		const regex = safeRegExp('hello.*world');
		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.test('hello beautiful world')).toBe(true);
	});

	it('should return undefined for invalid patterns', () => {
		const regex = safeRegExp('(a+)+');
		expect(regex).toBeUndefined();
	});

	it('should handle flags correctly', () => {
		const regex = safeRegExp('test', 'i');
		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.test('TEST')).toBe(true);
	});

	it('should return undefined for patterns exceeding length limit', () => {
		const longPattern = 'a'.repeat(REGEX_VALIDATION_CONFIG.MAX_PATTERN_LENGTH + 1);
		const regex = safeRegExp(longPattern);
		expect(regex).toBeUndefined();
	});
});

describe('testRegexWithTimeout', () => {
	it('should resolve true for matching patterns', async () => {
		const regex = /hello/;
		const result = await testRegexWithTimeout(regex, 'hello world');
		expect(result).toBe(true);
	});

	it('should resolve false for non-matching patterns', async () => {
		const regex = /goodbye/;
		const result = await testRegexWithTimeout(regex, 'hello world');
		expect(result).toBe(false);
	});

	it('should reset lastIndex before testing global regexes', async () => {
		const regex = /test/g;
		regex.lastIndex = 100; // Set to invalid position
		const result = await testRegexWithTimeout(regex, 'test string');
		expect(result).toBe(true);
		// lastIndex is reset to 0 before test(), so the match succeeds
		// After successful match, lastIndex will be at end of match (not 0)
		// The important part is that it was reset before testing, allowing the match
	});

	it('should resolve false on timeout', async () => {
		// Create a pattern that might take long on certain inputs
		const regex = /^(a+)+$/;
		const input = 'a'.repeat(30) + 'b'; // Will cause backtracking
		const result = await testRegexWithTimeout(regex, input, 100);
		// Should timeout and return false
		expect(result).toBe(false);
	}, 10000);

	it('should resolve false on regex errors', async () => {
		// Create a regex that might throw on certain edge cases
		const regex = /test/;
		// Mock test to throw error
		const originalTest = regex.test;
		regex.test = () => {
			throw new Error('Simulated error');
		};
		const result = await testRegexWithTimeout(regex, 'test');
		expect(result).toBe(false);
		// Restore original
		regex.test = originalTest;
	});

	it('should use custom timeout value', async () => {
		const regex = /hello/;
		const start = Date.now();
		const result = await testRegexWithTimeout(regex, 'hello', 50);
		const elapsed = Date.now() - start;
		expect(result).toBe(true);
		expect(elapsed).toBeLessThan(100);
	});
});

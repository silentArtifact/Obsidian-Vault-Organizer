import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Apply recommended ESLint rules
	eslint.configs.recommended,

	// Apply recommended TypeScript ESLint rules
	...tseslint.configs.recommended,

	// Global configuration
	{
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module',
				project: './tsconfig.json',
			},
		},

		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'no-console': 'off',
		},
	},

	// Ignore patterns - replaces .eslintignore and ignorePatterns
	{
		ignores: [
			'node_modules/',
			'coverage/',
			'main.js',
			'*.config.js',
			'*.config.mjs',
			'jest.config.js',
			'esbuild.config.mjs',
			'version-bump.mjs',
			'tests/**/*.ts',
			'__mocks__/**/*.ts',
		],
	}
);

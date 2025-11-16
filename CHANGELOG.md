# Changelog

All notable changes to the Obsidian Vault Organizer plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Exclusion Patterns UI with pattern validation and common templates
  - Add/remove exclusion patterns through settings interface
  - Real-time pattern validation with visual feedback
  - Quick-add templates for common patterns (Templates/**, *.excalidraw.md, etc.)
  - Pattern preview and duplicate detection

### Fixed
- Security vulnerabilities in development dependencies (js-yaml)
  - Added npm overrides to enforce js-yaml ^4.1.1
  - Resolved 19 moderate severity vulnerabilities in Jest testing dependencies

## [1.0.0] - 2024-01-15

### Added
- **Core Rule Engine**
  - Automatic note organization based on frontmatter rules
  - Multiple match types: equals, contains, starts-with, ends-with, regex
  - Case-sensitive and case-insensitive matching
  - First-match-wins rule evaluation with manual ordering (up/down arrows)
  - Enable/disable individual rules with toggle switches
  - Debug mode for previewing moves without executing

- **Variable Substitution**
  - Dynamic folder paths using `{variable}` syntax
  - Support for nested frontmatter values (e.g., `{author.name}`)
  - Array value handling (joins with `/` for nested folders)
  - Automatic path sanitization for cross-platform compatibility

- **Multi-Condition Rules**
  - Add multiple conditions to a single rule
  - AND/OR logic for combining conditions
  - Each condition supports all match types independently
  - Visual grouping of conditions in settings UI

- **Conflict Resolution Strategies**
  - Fail: Show error and don't move the file (default)
  - Skip: Silently skip the move
  - Append Number: Add -1, -2, etc. for unique filenames
  - Append Timestamp: Add timestamp for unique filenames
  - Optimized to prevent UI freezing (max 100 attempts)

- **Move History & Undo**
  - Automatic tracking of last 50 moves (configurable)
  - "Undo last automatic move" command
  - "View move history" modal with chronological display
  - Move metadata includes timestamp, paths, and rule information
  - Automatic cleanup when files no longer exist

- **Exclusion Patterns (Backend)**
  - Glob pattern support (`*`, `**`, `?`, `[abc]`)
  - LRU cache for compiled regex patterns (200-item limit)
  - ReDoS protection with complexity limits
  - Multi-level matching for folder hierarchies

- **User Interface**
  - Comprehensive settings panel with inline validation
  - Frontmatter key picker (browse existing keys)
  - Tag picker with toggle support (browse existing tags)
  - Real-time regex validation with error messages
  - Conflict resolution dropdown per rule
  - Condition operator selection (AND/OR)
  - "Test All Rules" preview modal
  - Responsive design with mobile support

- **Security & Validation**
  - Path traversal prevention (`../` blocked)
  - Cross-platform path validation (Windows, macOS, Linux)
  - Reserved name checking (CON, PRN, AUX, etc.)
  - Path length limits (255 chars per segment, 32,767 total)
  - Invalid character sanitization
  - ReDoS protection in regex validation
  - Variable name validation (prevents injection attacks)

- **Performance Optimizations**
  - Batch operation pattern (saves settings once per bulk operation)
  - Race condition protection (prevents duplicate processing)
  - Debounced settings saves (2s delay)
  - Debounced metadata refresh (1s delay)
  - Rate limiting for bulk operations (processes 100 files, then 50ms pause)
  - Regex compilation caching (200-item LRU cache)

- **Commands**
  - "Reorganize notes based on frontmatter rules" - Apply all rules on demand
  - "Undo last automatic move" - Revert most recent automatic move
  - "View move history" - Show all tracked moves

- **Testing**
  - 354 comprehensive tests across 15 test suites
  - 85.8% statement coverage
  - 71.41% branch coverage
  - 90.12% function coverage
  - Unit tests for all core modules
  - Integration tests for file operations
  - Performance regression tests
  - Edge case coverage

- **Error Handling**
  - Custom error types (VaultOrganizerError, PermissionError, FileConflictError, InvalidPathError)
  - User-friendly error messages with context
  - Proper error categorization
  - Graceful degradation on failures
  - Console logging for debugging

### Technical Details
- Built with TypeScript 5.3.3
- Zero linting errors (ESLint)
- Strict TypeScript checks enabled
- JSDoc documentation for public APIs
- Clean architecture with separation of concerns
- No circular dependencies

## [0.1.0] - Initial Development

### Added
- Basic frontmatter rule matching
- Simple file organization
- Settings interface

---

## Release Notes

### Version 1.0.0 - Production Ready

This is the first production-ready release of Obsidian Vault Organizer. The plugin has been thoroughly tested with 354 tests and demonstrates professional software engineering practices.

**Key Features:**
- ✅ Rule-based automatic note organization
- ✅ Variable substitution for dynamic folders
- ✅ Multi-condition rules with AND/OR logic
- ✅ Conflict resolution strategies
- ✅ Move history and undo functionality
- ✅ Comprehensive path validation and security
- ✅ Performance optimizations for large vaults

**Production Readiness:**
- 354 passing tests with 85.8% code coverage
- Zero linting errors
- Cross-platform compatibility
- Extensive error handling
- Security-conscious implementation

### Upgrade Guide

#### From 0.x to 1.0.0

1. **Backup your vault** before upgrading
2. Review your existing rules - they should work without changes
3. New features available:
   - Add conflict resolution strategies to existing rules
   - Use variable substitution in destination paths
   - Add multiple conditions to rules
   - Configure exclusion patterns (manual data.json edit until UI is added)

#### Breaking Changes

None. Version 1.0.0 is backward compatible with 0.x settings.

---

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## License

This project is licensed under the MIT License.

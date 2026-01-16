# Vault Organizer

**Automatically organize your Obsidian notes into folders based on frontmatter rules.**

Vault Organizer watches your notes and moves them to the right folders based on rules you define. Set `status: done` and your note moves to `Archive/`. Add `project: Website` and it goes to `Projects/Website/`. Simple as that.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Creating Rules](#creating-rules)
- [Rule Options Reference](#rule-options-reference)
- [Variable Substitution](#variable-substitution)
- [Move History & Undo](#move-history--undo)
- [Example Setups](#example-setups)
- [Advanced Features](#advanced-features)
- [Troubleshooting](#troubleshooting)
- [Building from Source](#building-from-source)

---

## Quick Start

**Get organized in 3 steps:**

1. **Open Settings** → Community Plugins → Vault Organizer
2. **Create a rule:**
   - Key: `status`
   - Value: `done`
   - Destination: `Archive`
3. **Activate the rule** → Notes with `status: done` now auto-file to `Archive/`

That's it. The plugin handles the rest automatically.

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings** → **Community Plugins**
2. Click **Browse** and search for "Vault Organizer"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release from GitHub
2. Extract to `YourVault/.obsidian/plugins/vault-organizer/`
3. Reload Obsidian
4. Enable the plugin in **Settings** → **Community Plugins**

---

## Creating Rules

### Step-by-Step

1. Go to **Settings** → **Community Plugins** → **Vault Organizer**
2. Click **Add Rule**
3. Configure the rule:

| Field | What to Enter |
|-------|---------------|
| **Key** | The frontmatter property to check (e.g., `status`, `tags`, `type`) |
| **Value** | What to match (e.g., `done`, `meeting`, `journal`) |
| **Destination** | Target folder path (e.g., `Archive`, `Projects/Active`) |

4. Toggle **Debug** ON to test (shows where files *would* move without moving them)
5. Once satisfied, toggle **Active** ON to enable auto-moving
6. Click **Apply now** to process existing notes

### How Matching Works

Rules run automatically when you:
- Create a new note
- Edit a note's frontmatter
- Rename or move a note

The **first matching rule wins**—order your rules from most specific to least specific.

---

## Rule Options Reference

| Option | Description |
|--------|-------------|
| **Key** | Frontmatter property name to inspect |
| **Value** | String to match (or regex pattern if Regex is enabled) |
| **Destination** | Folder path relative to vault root. Supports `{variables}` |
| **Match Type** | How to compare: Equals, Contains, Starts with, Ends with, or Regex |
| **Regex** | Enable to treat Value as a regular expression |
| **Conflict Resolution** | What to do if a file already exists at destination |
| **Active** | Toggle ON to enable the rule (starts OFF for safe setup) |
| **Debug** | Toggle ON to preview moves without actually moving files |

### Match Types

| Type | Matches When... |
|------|-----------------|
| **Equals** | Value exactly matches frontmatter value |
| **Contains** | Value appears anywhere in frontmatter value |
| **Starts with** | Frontmatter value begins with Value |
| **Ends with** | Frontmatter value ends with Value |
| **Regex** | Value (as regex) matches frontmatter value |

### Conflict Resolution Options

| Option | Behavior |
|--------|----------|
| **Fail** (default) | Show error, don't move |
| **Skip** | Silently skip the move |
| **Add number** | Append -1, -2, etc. to filename |
| **Add timestamp** | Append timestamp to filename |

---

## Variable Substitution

Make destinations dynamic using `{frontmatter_key}` syntax.

### Basic Example

**Frontmatter:**
```yaml
---
project: Website Redesign
status: active
---
```

**Rule:** Key: `status` → Value: `active` → Destination: `Projects/{project}`

**Result:** Note moves to `Projects/Website Redesign/`

### More Examples

| Destination Pattern | Result |
|--------------------|--------|
| `Projects/{project}` | `Projects/Website Redesign/` |
| `Archive/{year}/{month}` | `Archive/2024/January/` |
| `{department}/{team}/{project}` | `Engineering/Frontend/Dashboard/` |

### How Variables Work

- Variables pull values from the note's frontmatter
- Missing variables become empty strings (path cleaned automatically)
- Invalid path characters are sanitized
- Array values are joined with commas

---

## Move History & Undo

The plugin tracks every automatic move so you can undo mistakes.

### Commands

| Command | What It Does |
|---------|--------------|
| **View move history** | Shows all tracked moves (most recent first) |
| **Undo last automatic move** | Moves the file back to its original location |
| **Reorganize notes based on frontmatter rules** | Manually trigger rule processing |

### Important Notes

- Only automatic moves are tracked (not your manual file moves in Obsidian)
- Undo only works for the most recent move
- History persists across Obsidian sessions (stored in plugin data)
- Default: last 50 moves tracked
- Use **Clear History** button in the history modal to reset

---

## Example Setups

### Status-Based Workflow

Move notes through a pipeline based on status:

| Rule | Key | Value | Destination |
|------|-----|-------|-------------|
| 1 | `status` | `in-progress` | `Projects/Active` |
| 2 | `status` | `done` | `Projects/Archive` |
| 3 | `status` | `someday` | `Projects/Backlog` |

### Project Organization

Automatically sort into project folders:

| Rule | Key | Value | Destination |
|------|-----|-------|-------------|
| 1 | `project` | (any - use Contains with empty value) | `Projects/{project}` |

### Date-Based Archiving

Archive completed items by date:

| Rule | Key | Value | Destination |
|------|-----|-------|-------------|
| 1 | `status` | `done` | `Archive/{year}/{month}` |

### Tag Routing

Collect meeting notes (using regex to match tags starting with "meeting"):

| Rule | Key | Value | Match Type | Destination |
|------|-----|-------|------------|-------------|
| 1 | `tags` | `^meeting` | Regex (case-insensitive) | `Meetings` |

### Content Type Folders

Organize by note type:

| Rule | Key | Value | Destination |
|------|-----|-------|-------------|
| 1 | `type` | `journal` | `Journal` |
| 2 | `type` | `reference` | `Reference` |
| 3 | `type` | `daily` | `Daily Notes` |

### Conflict Handling for Daily Notes

Prevent overwrites with numbered duplicates:

| Rule | Key | Value | Destination | Conflict Resolution |
|------|-----|-------|-------------|---------------------|
| 1 | `type` | `daily` | `Daily/{year}` | Add number |

---

## Advanced Features

### Exclusion Patterns

Prevent specific files/folders from being organized.

> **Note:** Currently requires manual JSON editing. UI coming in a future update.

Edit `data.json` in the plugin folder:

```json
{
  "excludePatterns": [
    "Templates/**",
    "*.excalidraw",
    "Archive/**",
    "Daily Notes/*"
  ]
}
```

**Pattern syntax:**

| Pattern | Matches |
|---------|---------|
| `*` | Any characters except `/` |
| `**` | Any characters including `/` (recursive) |
| `?` | Single character |
| `[abc]` | Any character in set |

**Common patterns:**

| Pattern | Effect |
|---------|--------|
| `Templates/**` | Exclude entire Templates folder |
| `*.excalidraw` | Exclude Excalidraw files |
| `Archive/**` | Exclude archived files |
| `Daily Notes/*` | Exclude direct children of Daily Notes |

### Multi-Condition Rules

Combine conditions with AND/OR logic.

> **Note:** Currently requires manual JSON editing. UI coming in a future update.

**Example:** Move to Archive only when status is "done" AND priority is "low":

```json
{
  "key": "status",
  "value": "done",
  "matchType": "equals",
  "destination": "Archive/{year}",
  "enabled": true,
  "conditionOperator": "AND",
  "conditions": [
    {
      "key": "priority",
      "value": "low",
      "matchType": "equals"
    }
  ]
}
```

---

## Troubleshooting

### Nothing happens when I edit a note

- [ ] Is the rule **Active**? (toggle must be ON)
- [ ] Is **Debug** mode ON? (shows preview instead of moving)
- [ ] Does your note have the frontmatter key the rule checks?
- [ ] Is the frontmatter valid YAML (between `---` delimiters)?
- [ ] Is the destination path set and non-empty?

### Note moved to wrong location

1. Run **Undo last automatic move** from command palette
2. Check rule order (first match wins)
3. Enable **Debug** on suspect rules to preview behavior
4. Verify frontmatter spelling matches rule key exactly

### "File already exists" error

The destination already has a file with that name. Options:
- Change **Conflict Resolution** to "Add number" or "Add timestamp"
- Rename your note
- Delete/move the conflicting file

### Regex not working

- Check the pattern is valid (errors show in settings UI and dev console)
- For case-insensitive matching, add `i` flag
- Remember: `^` = start, `$` = end, `.` = any char, `.*` = any chars

### Files not in expected folder

- Destinations are **relative to vault root**
- Use Debug mode to see exact destination paths
- Check for typos in destination path
- Verify variable names match frontmatter keys exactly

### Only Markdown files are processed

By design. Other file types (images, PDFs, etc.) are ignored even if they contain frontmatter-like text.

---

## Building from Source

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Build in watch mode (for development)
npm run dev
```

**Install the build:**

Copy these files to `YourVault/.obsidian/plugins/vault-organizer/`:
- `main.js`
- `manifest.json`
- `styles.css`

Then reload Obsidian and enable the plugin.

---

## License

See [LICENSE](LICENSE) file.

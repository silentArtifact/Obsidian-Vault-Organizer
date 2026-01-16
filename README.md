# Vault Organizer

An Obsidian plugin that automatically organizes your notes into folders based on frontmatter rules.

**TL;DR:** Set up rules like "move notes with `status: done` to `Archive/`" and the plugin handles the rest automatically.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Creating Rules](#creating-rules)
- [Rule Options Reference](#rule-options-reference)
- [Variable Substitution](#variable-substitution)
- [Examples](#examples)
- [Move History & Undo](#move-history--undo)
- [Advanced Features](#advanced-features)
- [Troubleshooting](#troubleshooting)
- [Building from Source](#building-from-source)

---

## Quick Start

1. Install the plugin (see [Installation](#installation))
2. Go to **Settings → Community Plugins → Vault Organizer**
3. Click **Add Rule**
4. Configure your first rule:
   - **Key:** `status`
   - **Value:** `done`
   - **Destination:** `Archive`
5. Toggle **Active** to enable the rule
6. Done! Notes with `status: done` in their frontmatter will now move to `Archive/`

> **Tip:** Enable **Debug** mode first to see where notes *would* move without actually moving them.

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings → Community Plugins**
2. Click **Browse** and search for "Vault Organizer"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `YourVault/.obsidian/plugins/obsidian-vault-organizer/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in Community Plugins settings

---

## Creating Rules

### Step-by-Step

1. Open **Settings → Community Plugins → Vault Organizer**
2. Click **Add Rule**
3. Fill in the fields:
   | Field | What to enter |
   |-------|---------------|
   | Key | Frontmatter property name (e.g., `status`, `tags`, `type`) |
   | Value | What to match (e.g., `done`, `project-.*`) |
   | Destination | Target folder (e.g., `Archive`, `Projects/{project_name}`) |
4. Choose your **Match Type** (Equals, Contains, Starts with, Ends with, or Regex)
5. Toggle **Active** when ready

### When Rules Run

Rules automatically trigger when you:
- Create a new markdown file
- Edit a markdown file
- Rename or move a markdown file
- Update frontmatter metadata

You can also run rules manually via Command Palette: **Reorganize notes based on frontmatter rules**

### Rule Priority

Rules are evaluated top-to-bottom. **The first matching rule wins.** Drag rules to reorder them.

---

## Rule Options Reference

| Option | Description |
|--------|-------------|
| **Key** | Frontmatter property to inspect |
| **Value** | Text or regex pattern to match |
| **Match Type** | How to compare: Equals, Contains, Starts with, Ends with, Regex |
| **Destination** | Target folder path (supports `{variables}`) |
| **Conflict Resolution** | What to do if file exists at destination |
| **Active** | Rule only runs when enabled |
| **Debug** | Preview moves without actually moving files |

### Conflict Resolution Options

| Option | Behavior |
|--------|----------|
| **Fail** (default) | Show error, don't move |
| **Skip** | Silently skip |
| **Add number** | Append `-1`, `-2`, etc. to filename |
| **Add timestamp** | Append timestamp to filename |

---

## Variable Substitution

Use `{variable}` in destinations to create dynamic folder paths based on frontmatter values.

### Syntax

```
Projects/{project_name}
Archive/{year}/{month}
Team/{department}/{project}
```

### Example

Given this frontmatter:
```yaml
---
project_name: Website Redesign
year: 2024
---
```

With destination `Projects/{project_name}`, the note moves to `Projects/Website Redesign/`.

### Behavior

- Missing variables → replaced with empty string
- Invalid path characters → automatically sanitized
- Array values → joined with commas

---

## Examples

### Basic Status Pipeline

| Rule | Key | Value | Destination |
|------|-----|-------|-------------|
| 1 | `status` | `in-progress` | `Projects/In Progress` |
| 2 | `status` | `done` | `Projects/Archive` |

### Dynamic Project Organization

| Key | Value | Destination |
|-----|-------|-------------|
| `status` | `active` | `Projects/{project_name}` |

Result: Each project gets its own folder automatically.

### Date-Based Archiving

| Key | Value | Destination |
|-----|-------|-------------|
| `status` | `done` | `Archive/{year}/{month}` |

### Tag-Based Routing (Regex)

| Key | Value | Match Type | Destination |
|-----|-------|------------|-------------|
| `tags` | `^meeting` | Regex (case-insensitive) | `Meetings` |

Matches notes with tags starting with "meeting".

### Content Type Folders

| Key | Value | Destination |
|-----|-------|-------------|
| `type` | `journal` | `Journal` |
| `type` | `reference` | `Reference` |
| `type` | `daily` | `Daily/{year}` |

### Handling Duplicates

For daily notes that might have name conflicts:

| Key | Value | Destination | Conflict Resolution |
|-----|-------|-------------|---------------------|
| `type` | `daily` | `Daily/{year}` | Add number |

---

## Move History & Undo

The plugin tracks all automatic moves for safety.

### Commands

| Command | Action |
|---------|--------|
| **View move history** | See all tracked moves (most recent first) |
| **Undo last automatic move** | Move file back to original location |

### How It Works

- Every successful move is recorded (timestamp, paths, rule)
- Last 50 moves are kept by default
- Undo restores file to original location
- Clear history button available in history modal

### Important Notes

- Only automatic moves are tracked (not manual file moves)
- Undo only works for the most recent move
- History persists across Obsidian sessions

---

## Advanced Features

### Exclusion Patterns

Prevent specific files/folders from being organized using glob patterns.

**Setup:** Edit `data.json` in the plugin folder and add:

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

**Pattern Syntax:**

| Pattern | Matches |
|---------|---------|
| `*` | Any characters except `/` |
| `**` | Any characters including `/` (recursive) |
| `?` | Single character |
| `[abc]` | Any character in set |

### Multi-Condition Rules

Combine multiple conditions with AND/OR logic.

**Setup:** Edit `data.json`:

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

This moves notes to Archive only when `status` is "done" **AND** `priority` is "low".

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Rule not working** | Check that **Active** is toggled on |
| **Notes not moving** | Verify the frontmatter key exists and is spelled correctly |
| **Wrong destination** | Enable **Debug** mode to preview moves first |
| **Regex errors** | Check console for parsing errors; fix pattern and click **Apply now** |
| **File already exists** | Set **Conflict Resolution** to "Add number" or "Add timestamp" |
| **Non-markdown files ignored** | This is expected; only `.md` files are processed |
| **Multiple rules could match** | First matching rule wins; reorder rules as needed |

### Debug Checklist

1. Is the rule **Active**?
2. Does the frontmatter **key** exist in the note?
3. Does the **value** match (check Match Type)?
4. Is the **destination** path correct?
5. Enable **Debug** mode to see what would happen

---

## Building from Source

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development (watch mode)
npm run dev
```

Then copy `main.js`, `manifest.json`, and `styles.css` to:
```
YourVault/.obsidian/plugins/obsidian-vault-organizer/
```

Reload Obsidian and enable the plugin.

---

## License

See [LICENSE](LICENSE) for details.

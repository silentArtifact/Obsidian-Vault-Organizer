# Vault Organizer

Vault Organizer is an Obsidian plugin that watches the frontmatter of your Markdown notes and automatically files them into folders that match rules you define.

## Frontmatter rules at a glance

Each rule targets frontmatter properties and determines what to do when the note contains matching values:

- **Key** – the name of the frontmatter property to inspect (for example `status`, `tags`, or `type`).
- **Value** – either a literal string that must match exactly or a regular expression (enable **Regex** to switch modes). Frontmatter arrays are supported; the rule matches if *any* element satisfies the value check.
- **Destination** – the folder path (relative to the vault root) where matching notes should live. **Supports variable substitution** with `{variable}` syntax (e.g., `Projects/{project_name}`) to dynamically create folders based on frontmatter values. Missing folders are created on demand when the rule runs.
- **Match Type** – choose how to match the value: Equals (exact match), Contains (substring), Starts with, Ends with, or Regex (regular expression).
- **Conflict Resolution** – what to do when a file already exists at the destination:
  - **Fail** (default) – show an error and don't move the file
  - **Skip** – silently skip the move
  - **Add number** – append -1, -2, etc. to create a unique filename
  - **Add timestamp** – append a timestamp to create a unique filename
- **Active** – rules start disabled so you can finish configuring them safely. Flip the toggle to enable a rule once it's ready to run.
- **Debug** – when enabled the plugin only reports where the note *would* move and leaves it in place, which is useful when testing a new rule.

Rules are evaluated in the order they appear in the settings tab; the first matching rule wins. Notes without matching rules are left untouched.

### Adding and editing rules

1. Open **Settings → Community Plugins → Vault Organizer**.
2. Use **Add Rule** to create a new entry or edit the inputs beside an existing rule.
3. Fill in the key, value, and destination. Toggle **Regex** if the value should be treated as a regular expression and supply flags such as `i` for case-insensitive matching.
4. When you are satisfied, flip **Activate this rule** on to begin moving notes. Leave it off while drafting so the rule cannot run prematurely.
5. Toggle **Debug** while experimenting so you can confirm moves without reorganizing files immediately.
6. Press **Apply now** (or toggle Regex/Activate/Debug) to save changes and immediately re-run the rules across your vault. Otherwise, updates are saved automatically after a short pause.

You can also run the **Reorganize notes based on frontmatter rules** command from the command palette to apply the current rules on demand.

### Automatic moves

Vault Organizer listens for vault changes and applies the rules when:

- A Markdown file is created.
- A Markdown file is modified.
- A Markdown file is renamed or moved.
- Obsidian finishes reading updated frontmatter metadata for a Markdown file.

If a matching rule has a non-empty destination and Debug is off, the plugin moves the note into that folder. When Debug is on, a notice appears instead (e.g., `DEBUG: NoteTitle would be moved to Vault/Projects/In Progress`).

### Move history and undo

Vault Organizer tracks the history of automatic moves to provide a safety net for your file organization:

- **Automatic tracking** – Every time the plugin successfully moves a note, it records the move (timestamp, original path, new path, and which rule triggered it).
- **Move history** – By default, the last 50 moves are kept. Use the **View move history** command from the command palette to see all tracked moves in chronological order with the most recent at the top.
- **Undo last move** – If the plugin moved a note to the wrong location, run **Undo last automatic move** from the command palette. This command:
  - Moves the file back to its original location
  - Creates any necessary folders automatically
  - Removes the move from the history
  - Shows an error if the file no longer exists or if another file already occupies the original location
- **Clear history** – The move history modal includes a **Clear History** button to remove all tracked moves if needed.

**Important notes:**
- Only automatic moves triggered by rules are tracked. Manual file moves you perform in Obsidian are not recorded.
- The undo command only works for the most recent move in the history. You cannot undo older moves directly, but you can view them in the history modal.
- If a file has been moved multiple times, undoing will only reverse the last move, not all previous moves.
- Move history is stored in the plugin's data file and persists across Obsidian sessions.

## Building and installing from source

1. Install dependencies with `npm install`.
2. Build the production bundle with `npm run build`. This compiles `main.ts` into `main.js` using esbuild.
3. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `Vault/.obsidian/plugins/obsidian-vault-organizer/` (create the folder if needed).
4. Reload Obsidian and enable the plugin from the Community Plugins settings panel.

For development, `npm run dev` keeps the build running in watch mode while you edit TypeScript sources.

## Advanced Features

### Variable Substitution

Destinations can include variables from the note's frontmatter using `{variable}` syntax. This allows you to create dynamic folder structures based on note metadata.

**Examples:**
- `Projects/{project_name}` – organize by project name from frontmatter
- `Archive/{year}/{month}` – organize by year and month
- `Team/{department}/{project}` – multi-level organization

**How it works:**
- Variables are replaced with their frontmatter values when the rule runs
- Missing variables are replaced with empty strings (folders are cleaned up automatically)
- Invalid path characters are automatically sanitized
- Array values are joined with commas

**Example frontmatter and result:**
```yaml
---
project_name: Website Redesign
year: 2024
---
```
With destination `Projects/{project_name}`, the note moves to `Projects/Website Redesign/`.

### Exclusion Patterns

Prevent automatic file organization for specific files or folders using glob patterns.

**Note:** Exclusion patterns are fully supported in the backend but currently require manual configuration. To set up exclusion patterns, edit the plugin's `data.json` file and add patterns to the `excludePatterns` array. A UI for managing exclusion patterns will be added in a future update.

**Configuration example (in data.json):**
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
- `*` – matches any characters except /
- `**` – matches any characters including / (for recursive matching)
- `?` – matches a single character
- `[abc]` – matches any character in the set

**Examples:**
- `Templates/**` – exclude everything in Templates folder
- `*.excalidraw` – exclude all Excalidraw drawings
- `Archive/**` – exclude archived files
- `Daily Notes/*` – exclude files directly in Daily Notes (but not subfolders)

Files matching any exclusion pattern will not be automatically organized, even if they match a rule.

### Multi-Condition Rules (Advanced)

**Note:** Multi-condition support is available in the rule data structure but requires manual JSON editing of the plugin's data file. A full UI for this feature is planned for a future update.

Rules can have multiple conditions combined with AND or OR logic:
- **AND** – all conditions must match (more restrictive)
- **OR** – at least one condition must match (more permissive)

**Example JSON configuration:**
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
This rule moves notes to Archive only when status is "done" AND priority is "low".

## Example rule setups

- **Status-based pipeline** – `status = "in-progress"` → `Projects/In Progress`, `status = "done"` → `Projects/Archive`.
- **Dynamic project folders** – `status = "active"` → `Projects/{project_name}` to organize each project separately.
- **Date-based archiving** – `status = "done"` → `Archive/{year}/{month}` for chronological organization.
- **Tag routing** – Regex rule with `key = "tags"`, `value = "^meeting"`, `flags = "i"`, `destination = "Meetings"` to collect all notes whose tags start with `meeting`.
- **Type folders** – `type = "journal"` → `Journal`, `type = "reference"` → `Reference`.
- **Area and projects** – Regex on `area` such as `^(home|family)$` → `Areas/Personal`, while a simple rule `area = "work"` → `Areas/Work`.
- **Conflict handling** – Use "Add number" conflict resolution for daily notes to prevent overwrites: `type = "daily"` → `Daily/{year}` with conflict resolution set to "Add number".

Feel free to stack these rules; only the first rule that matches a note will move it.

## Troubleshooting and limitations

- **Invalid regular expressions** – When a regex cannot be parsed the rule is skipped, a warning appears in the settings UI, and a notice is logged to the developer console. Edit the pattern or flags, then click **Apply now**.
- **Destination is required** – Rules with an empty destination never move notes. Confirm the path is set and spelled correctly.
- **Only Markdown files are processed** – Other file types are ignored, even if they contain frontmatter-like text.
- **One rule per note** – The plugin stops at the first matching rule. Order rules carefully if multiple destinations could apply.
- **Frontmatter must exist** – Notes without the configured key are ignored. Double-check the frontmatter key spelling and that it is located above the `---` delimiter.
- **Unexpected folder structure** – Remember that destinations are relative to the vault root. Use Debug mode first if you are unsure where a rule will move a note.
- **Move conflicts** – If Obsidian cannot move a note (for example, when another file already exists at the destination), a notice such as `Failed to move "Note Title" to "Projects/Note Title.md": EEXIST: file already exists` appears so you know which file was affected and why.

If something still looks wrong, enable Debug on the suspect rule to view the notices generated during future edits, and verify the values stored in the note’s frontmatter.

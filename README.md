# Vault Organizer

Vault Organizer is an Obsidian plugin that watches the frontmatter of your Markdown notes and automatically files them into folders that match rules you define.

## Frontmatter rules at a glance

Each rule targets a single frontmatter key and determines what to do when the note contains a matching value:

- **Key** – the name of the frontmatter property to inspect (for example `status`, `tags`, or `type`).
- **Value** – either a literal string that must match exactly or a regular expression (enable **Regex** to switch modes). Frontmatter arrays are supported; the rule matches if *any* element satisfies the value check.
- **Destination** – the folder path (relative to the vault root) where matching notes should live. Missing folders are created on demand when the rule runs.
- **Active** – rules start disabled so you can finish configuring them safely. Flip the toggle to enable a rule once it’s ready to run.
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

## Building and installing from source

1. Install dependencies with `npm install`.
2. Build the production bundle with `npm run build`. This compiles `main.ts` into `main.js` using esbuild.
3. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `Vault/.obsidian/plugins/obsidian-vault-organizer/` (create the folder if needed).
4. Reload Obsidian and enable the plugin from the Community Plugins settings panel.

For development, `npm run dev` keeps the build running in watch mode while you edit TypeScript sources.

## Example rule setups

- **Status-based pipeline** – `status = "in-progress"` → `Projects/In Progress`, `status = "done"` → `Projects/Archive`.
- **Tag routing** – Regex rule with `key = "tags"`, `value = "^meeting"`, `flags = "i"`, `destination = "Meetings"` to collect all notes whose tags start with `meeting`.
- **Type folders** – `type = "journal"` → `Journal`, `type = "reference"` → `Reference`.
- **Area and projects** – Regex on `area` such as `^(home|family)$` → `Areas/Personal`, while a simple rule `area = "work"` → `Areas/Work`.

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

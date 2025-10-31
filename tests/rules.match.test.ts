import { matchFrontmatter, FrontmatterRule } from '../src/rules';
import type { App, TFile } from 'obsidian';

describe('matchFrontmatter', () => {
  let app: App;
  let metadataCache: { getFileCache: jest.Mock };
  let file: TFile;

  beforeEach(() => {
    metadataCache = { getFileCache: jest.fn() };
    app = { metadataCache } as unknown as App;
    file = { path: 'Test.md' } as TFile;
  });

  it('matches exact string values', () => {
    const frontmatter = { tag: 'journal' };
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches regex values', () => {
    const frontmatter = { tag: 'Journal' };
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'regex', value: /journal/i, destination: 'Journal', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('ignores disabled rules', () => {
    const frontmatter = { tag: 'journal' };
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Disabled', enabled: false },
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Active', enabled: true },
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[1]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches using contains/starts-with/ends-with operators', () => {
    const frontmatter = { tag: 'journal-entry' };
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'contains', value: 'journal', destination: 'Contains', enabled: true },
      { key: 'tag', matchType: 'starts-with', value: 'journal', destination: 'StartsWith', enabled: true },
      { key: 'tag', matchType: 'ends-with', value: 'entry', destination: 'EndsWith', enabled: true },
    ];
    expect(matchFrontmatter.call({ app }, file, [rules[0]], frontmatter)).toEqual(rules[0]);
    expect(matchFrontmatter.call({ app }, file, [rules[1]], frontmatter)).toEqual(rules[1]);
    expect(matchFrontmatter.call({ app }, file, [rules[2]], frontmatter)).toEqual(rules[2]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('does not match partial rules with empty values', () => {
    const frontmatter = { tag: 'journal-entry' };
    const baseRule = { key: 'tag', value: '', destination: 'Invalid', enabled: true } as const;
    const containsRule: FrontmatterRule = { ...baseRule, matchType: 'contains' };
    const startsWithRule: FrontmatterRule = { ...baseRule, matchType: 'starts-with' };
    const endsWithRule: FrontmatterRule = { ...baseRule, matchType: 'ends-with' };

    expect(matchFrontmatter.call({ app }, file, [containsRule], frontmatter)).toBeUndefined();
    expect(matchFrontmatter.call({ app }, file, [startsWithRule], frontmatter)).toBeUndefined();
    expect(matchFrontmatter.call({ app }, file, [endsWithRule], frontmatter)).toBeUndefined();
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('returns undefined when no frontmatter or missing keys', () => {
    metadataCache.getFileCache.mockReturnValue({});
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', enabled: true }
    ];
    const resultNoFrontmatter = matchFrontmatter.call({ app }, file, rules);
    expect(resultNoFrontmatter).toBeUndefined();

    metadataCache.getFileCache.mockReturnValue({ frontmatter: {} });
    const resultMissingKey = matchFrontmatter.call({ app }, file, rules);
    expect(resultMissingKey).toBeUndefined();
  });

  it('returns the first matching rule when multiple rules match', () => {
    const frontmatter = { tag: 'journal' };
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'note', destination: 'Note', enabled: true },
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', enabled: true },
      { key: 'tag', matchType: 'regex', value: /journal/, destination: 'JournalRegex', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[1]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches when frontmatter values are arrays of strings', () => {
    const frontmatter = { tags: ['work', 'journal'] };
    const rules: FrontmatterRule[] = [
      { key: 'tags', matchType: 'equals', value: 'journal', destination: 'Journal Folder', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches when array values include mixed scalar types', () => {
    const frontmatter = { tags: ['daily', 42, true] };
    const rules: FrontmatterRule[] = [
      { key: 'tags', matchType: 'equals', value: '42', destination: 'Numbers', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches any selected tag when rule values contain multiple tags', () => {
    const frontmatter = { tags: ['#journal', '#ideas'] };
    const rules: FrontmatterRule[] = [
      { key: 'tags', matchType: 'equals', value: '#daily #ideas #todo', destination: 'Ideas', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('matches regex rules against array elements', () => {
    const frontmatter = { tags: ['Work', 'Journal'] };
    const rules: FrontmatterRule[] = [
      { key: 'tags', matchType: 'regex', value: /journal/i, destination: 'Journal Regex', enabled: true }
    ];
    const result = matchFrontmatter.call({ app }, file, rules, frontmatter);
    expect(result).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('resets global regex rules between different notes', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'regex', value: /journal/g, destination: 'Journal Global', enabled: true }
    ];

    const fileA = { path: 'First.md' } as TFile;
    const fileB = { path: 'Second.md' } as TFile;

    const firstResult = matchFrontmatter.call({ app }, fileA, rules, { tag: 'journal' });
    const secondResult = matchFrontmatter.call({ app }, fileB, rules, { tag: 'journal' });

    expect(firstResult).toEqual(rules[0]);
    expect(secondResult).toEqual(rules[0]);
    expect(metadataCache.getFileCache).not.toHaveBeenCalled();
  });
});

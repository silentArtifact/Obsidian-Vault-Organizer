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
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[0]);
  });

  it('matches regex values', () => {
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'Journal' } });
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: /journal/i, destination: 'Journal' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[0]);
  });

  it('returns undefined when no frontmatter or missing keys', () => {
    metadataCache.getFileCache.mockReturnValue({});
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal' }
    ];
    const resultNoFrontmatter = matchFrontmatter.call({ app }, file, rules);
    expect(resultNoFrontmatter).toBeUndefined();

    metadataCache.getFileCache.mockReturnValue({ frontmatter: {} });
    const resultMissingKey = matchFrontmatter.call({ app }, file, rules);
    expect(resultMissingKey).toBeUndefined();
  });

  it('returns the first matching rule when multiple rules match', () => {
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tag: 'journal' } });
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'note', destination: 'Note' },
      { key: 'tag', value: 'journal', destination: 'Journal' },
      { key: 'tag', value: /journal/, destination: 'JournalRegex' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[1]);
  });

  it('matches when frontmatter values are arrays of strings', () => {
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['work', 'journal'] } });
    const rules: FrontmatterRule[] = [
      { key: 'tags', value: 'journal', destination: 'Journal Folder' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[0]);
  });

  it('matches when array values include mixed scalar types', () => {
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['daily', 42, true] } });
    const rules: FrontmatterRule[] = [
      { key: 'tags', value: '42', destination: 'Numbers' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[0]);
  });

  it('matches regex rules against array elements', () => {
    metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ['Work', 'Journal'] } });
    const rules: FrontmatterRule[] = [
      { key: 'tags', value: /journal/i, destination: 'Journal Regex' }
    ];
    const result = matchFrontmatter.call({ app }, file, rules);
    expect(result).toEqual(rules[0]);
  });
});

import { serializeFrontmatterRules, deserializeFrontmatterRules, FrontmatterRule } from '../src/rules';

describe('Frontmatter rule serialization', () => {
  it('round-trips plain string rules', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal' }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result).toEqual(rules);
  });

  it('round-trips regex rules with flags', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: /journal/i, destination: 'Journal' }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result).toHaveLength(1);
    const rule = result[0];
    expect(rule.value).toBeInstanceOf(RegExp);
    const regex = rule.value as RegExp;
    expect(regex.source).toBe('journal');
    expect(regex.flags).toBe('i');
  });

  it('preserves debug field during round-trip', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal', debug: true }
    ];
    const result = deserializeFrontmatterRules(serializeFrontmatterRules(rules));
    expect(result[0].debug).toBe(true);
  });
});

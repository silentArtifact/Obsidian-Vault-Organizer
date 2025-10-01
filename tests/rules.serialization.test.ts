import {
  serializeFrontmatterRules,
  deserializeFrontmatterRules,
  FrontmatterRule,
  SerializedFrontmatterRule
} from '../src/rules';

describe('Frontmatter rule serialization', () => {
  it('round-trips plain string rules', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal' }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result.rules).toEqual(rules);
    expect(result.errors).toHaveLength(0);
  });

  it('round-trips regex rules with flags', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', value: /journal/i, destination: 'Journal' }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
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
    expect(result.rules[0].debug).toBe(true);
  });

  it('retains regex metadata when round-tripping serialized data', () => {
    const serialized: SerializedFrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal', isRegex: true, flags: 'i', debug: true }
    ];
    const deserialized = deserializeFrontmatterRules(serialized);
    const result = serializeFrontmatterRules(deserialized.rules);
    expect(result).toEqual(serialized);
  });

  it('ignores malformed regex data during deserialization', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const malformed: SerializedFrontmatterRule[] = [
        { key: 'tag', value: '\\', destination: 'Journal', isRegex: true }
      ];
      const result = deserializeFrontmatterRules(malformed);
      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toEqual(malformed[0]);
      expect(result.errors[0].message).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to deserialize regex'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});

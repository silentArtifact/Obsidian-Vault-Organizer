import {
  serializeFrontmatterRules,
  deserializeFrontmatterRules,
  FrontmatterRule,
  SerializedFrontmatterRule
} from '../src/rules';

describe('Frontmatter rule serialization', () => {
  it('round-trips plain string rules', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', enabled: true }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result.rules).toEqual(rules);
    expect(result.errors).toHaveLength(0);
  });

  it('round-trips regex rules with flags', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'regex', value: /journal/i, destination: 'Journal', enabled: true }
    ];
    const serialized = serializeFrontmatterRules(rules);
    const result = deserializeFrontmatterRules(serialized);
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
    expect(rule.value).toBeInstanceOf(RegExp);
    const regex = rule.value as RegExp;
    expect(regex.source).toBe('journal');
    expect(regex.flags).toBe('i');
    expect(rule.matchType).toBe('regex');
  });

  it('preserves debug field during round-trip', () => {
    const rules: FrontmatterRule[] = [
      { key: 'tag', matchType: 'equals', value: 'journal', destination: 'Journal', debug: true, enabled: true }
    ];
    const result = deserializeFrontmatterRules(serializeFrontmatterRules(rules));
    expect(result.rules[0].debug).toBe(true);
    expect(result.rules[0].matchType).toBe('equals');
  });

  it('retains regex metadata when round-tripping serialized data', () => {
    const serialized: SerializedFrontmatterRule[] = [
      { key: 'tag', value: 'journal', destination: 'Journal', isRegex: true, flags: 'i', debug: true }
    ];
    const deserialized = deserializeFrontmatterRules(serialized);
    const result = serializeFrontmatterRules(deserialized.rules);
    expect(result).toEqual([{ key: 'tag', matchType: 'regex', value: 'journal', destination: 'Journal', enabled: false, isRegex: true, flags: 'i', debug: true }]);
  });

  it('ignores malformed regex data during deserialization', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const malformed: SerializedFrontmatterRule[] = [
        { key: 'tag', value: '\\', destination: 'Journal', isRegex: true }
      ];
      const result = deserializeFrontmatterRules(malformed);
      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toEqual({ ...malformed[0], matchType: 'regex' });
      expect(result.errors[0].message).toBeDefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to deserialize regex'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('supports non-regex match types', () => {
    const serialized: SerializedFrontmatterRule[] = [
      { key: 'tag', value: 'jour', destination: 'Journal', matchType: 'contains' },
      { key: 'tag', value: 'Jour', destination: 'Journal', matchType: 'starts-with' },
      { key: 'tag', value: 'nal', destination: 'Journal', matchType: 'ends-with' },
    ];
    const deserialized = deserializeFrontmatterRules(serialized);
    expect(deserialized.rules.map(rule => rule.matchType)).toEqual(['contains', 'starts-with', 'ends-with']);
    const reserialized = serializeFrontmatterRules(deserialized.rules);
    expect(reserialized).toEqual([
      { key: 'tag', matchType: 'contains', value: 'jour', destination: 'Journal', enabled: false },
      { key: 'tag', matchType: 'starts-with', value: 'Jour', destination: 'Journal', enabled: false },
      { key: 'tag', matchType: 'ends-with', value: 'nal', destination: 'Journal', enabled: false },
    ]);
  });
});

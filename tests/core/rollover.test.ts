import {
  collectIncompleteToday,
  insertIntoBelowTop,
  rolloverInto,
  shouldRollover,
} from '../../src/core/rollover';

describe('collectIncompleteToday', () => {
  it('collects only open today tasks, preserving raw lines', () => {
    const content = [
      '- [x] 끝난 거',
      '- [ ] 안 끝난 거 A',
      '- [ ] 안 끝난 거 B',
      '---',
      '- [ ] 미래 태스크',
    ].join('\n');
    expect(collectIncompleteToday(content)).toEqual([
      '- [ ] 안 끝난 거 A',
      '- [ ] 안 끝난 거 B',
    ]);
  });
});

describe('insertIntoBelowTop', () => {
  it('inserts at the top of an existing below section', () => {
    const content = ['- [ ] today', '---', '- [ ] existing below'].join('\n');
    expect(insertIntoBelowTop(content, ['- [ ] carried'])).toBe(
      ['- [ ] today', '---', '- [ ] carried', '- [ ] existing below'].join('\n')
    );
  });

  it('creates a divider when the note has none', () => {
    expect(insertIntoBelowTop('- [ ] today', ['- [ ] carried'])).toBe(
      '- [ ] today\n---\n- [ ] carried'
    );
  });

  it('handles an empty note (new daily note)', () => {
    expect(insertIntoBelowTop('', ['- [ ] a', '- [ ] b'])).toBe(
      '---\n- [ ] a\n- [ ] b'
    );
  });

  it('is a no-op with nothing to carry', () => {
    expect(insertIntoBelowTop('- [ ] today', [])).toBe('- [ ] today');
  });
});

describe('rolloverInto — Fixture 5', () => {
  const yesterday = [
    '- [x] 끝난 거',
    '- [ ] 안 끝난 거 A',
    '- [ ] 안 끝난 거 B',
    '---',
    '- [ ] 미래 태스크',
  ].join('\n');

  it('carries incomplete today tasks into a fresh today note', () => {
    const { content, carried } = rolloverInto(yesterday, '');
    expect(carried).toEqual(['- [ ] 안 끝난 거 A', '- [ ] 안 끝난 거 B']);
    expect(content).toBe('---\n- [ ] 안 끝난 거 A\n- [ ] 안 끝난 거 B');
  });
});

describe('shouldRollover', () => {
  it('runs when last_rollover is unset or older than today', () => {
    expect(shouldRollover(null, '2026-06-02')).toBe(true);
    expect(shouldRollover('2026-06-01', '2026-06-02')).toBe(true);
  });
  it('is a no-op once already rolled over today', () => {
    expect(shouldRollover('2026-06-02', '2026-06-02')).toBe(false);
    expect(shouldRollover('2026-06-03', '2026-06-02')).toBe(false);
  });
});

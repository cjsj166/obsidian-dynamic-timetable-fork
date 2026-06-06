import { diffRange } from '../../src/editor/writeback';

describe('diffRange', () => {
  it('returns null when equal', () => {
    expect(diffRange('abc', 'abc')).toBeNull();
  });

  it('finds a minimal middle replacement', () => {
    expect(diffRange('hello world', 'hello brave world')).toEqual({
      from: 6,
      to: 6,
      insert: 'brave ',
    });
  });

  it('handles a pure append', () => {
    expect(diffRange('abc', 'abcdef')).toEqual({ from: 3, to: 3, insert: 'def' });
  });

  it('handles a deletion', () => {
    expect(diffRange('abcdef', 'abef')).toEqual({ from: 2, to: 4, insert: '' });
  });

  it('applying the range reproduces next', () => {
    const cur = '- [ ] a\n%%task:x%%\nnote';
    const next = '- [ ] a ^x\n%%task:x%%\nnote';
    const d = diffRange(cur, next)!;
    const applied = cur.slice(0, d.from) + d.insert + cur.slice(d.to);
    expect(applied).toBe(next);
  });
});

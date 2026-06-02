import { moveLine, dropIndex } from '../../src/core/edit';

const doc = (lines: string[]) => lines.join('\n');

describe('moveLine', () => {
  const lines = ['a', 'b', 'c', 'd'];

  it('moves a line down (to a later original index)', () => {
    // move "a" (0) to just after "c": insert before original index 3.
    expect(moveLine(doc(lines), 0, 3)).toBe(doc(['b', 'c', 'a', 'd']));
  });

  it('moves a line up', () => {
    // move "d" (3) before "b" (index 1).
    expect(moveLine(doc(lines), 3, 1)).toBe(doc(['a', 'd', 'b', 'c']));
  });

  it('is a no-op when dropped on itself', () => {
    expect(moveLine(doc(lines), 1, 1)).toBe(doc(lines));
    expect(moveLine(doc(lines), 1, 2)).toBe(doc(lines));
  });

  it('ignores out-of-range source', () => {
    expect(moveLine(doc(lines), 9, 0)).toBe(doc(lines));
  });

  it('crosses a divider transparently', () => {
    const d = ['- [ ] x', '---', '- [ ] y'];
    // move today task (0) to after the below task (insert at end, index 3).
    expect(moveLine(doc(d), 0, 3)).toBe(doc(['---', '- [ ] y', '- [ ] x']));
    // move below task (2) above the divider into today (insert at index 0).
    expect(moveLine(doc(d), 2, 0)).toBe(doc(['- [ ] y', '- [ ] x', '---']));
  });

  it('preserves interleaved prose', () => {
    const d = ['# heading', '- [ ] a', 'some note', '- [ ] b'];
    expect(moveLine(doc(d), 3, 1)).toBe(
      doc(['# heading', '- [ ] b', '- [ ] a', 'some note'])
    );
  });
});

describe('dropIndex', () => {
  it('targets before/after', () => {
    expect(dropIndex(5, false)).toBe(5);
    expect(dropIndex(5, true)).toBe(6);
  });
});

import {
  moveLine,
  dropIndex,
  moveBlock,
  taskBlockEnd,
} from '../../src/core/edit';

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

describe('taskBlockEnd', () => {
  it('includes indented child lines', () => {
    const lines = [
      '- [ ] A',
      '  note under A',
      '  - subitem',
      '- [ ] B',
    ];
    expect(taskBlockEnd(lines, 0)).toBe(3); // A + 2 children, stops at B
    expect(taskBlockEnd(lines, 3)).toBe(4); // B alone
  });

  it('includes an un-indented note written directly under a task', () => {
    const lines = [
      '- [ ] 팀 미팅 @ 13:00 ; 1:00',
      '팀 미팅할 때 말할 내용',
      '- [ ] 코드 리뷰 ; 2:00',
    ];
    expect(taskBlockEnd(lines, 0)).toBe(2); // task + its note, stops at next task
  });

  it('ends the block at a blank line and at the divider', () => {
    const lines = ['- [ ] A', '  child', '', '- [ ] B'];
    expect(taskBlockEnd(lines, 0)).toBe(2);
    const d = ['- [ ] A', '  child', '---', '- [ ] B'];
    expect(taskBlockEnd(d, 0)).toBe(2);
  });
});

describe('moveBlock', () => {
  it('moves a task and its children together', () => {
    const lines = [
      '- [ ] A',
      '  child A',
      '- [ ] B',
      '  child B',
    ];
    // move block B (index 2..4) above A (index 0).
    expect(moveBlock(lines.join('\n'), 2, 4, 0)).toBe(
      ['- [ ] B', '  child B', '- [ ] A', '  child A'].join('\n')
    );
  });

  it('moves a block downward past a later block', () => {
    const lines = ['- [ ] A', '  child A', '- [ ] B', '  child B'];
    // move block A (0..2) to after block B (toIndex 4).
    expect(moveBlock(lines.join('\n'), 0, 2, 4)).toBe(
      ['- [ ] B', '  child B', '- [ ] A', '  child A'].join('\n')
    );
  });

  it('is a no-op when dropped inside its own block', () => {
    const lines = ['- [ ] A', '  child A', '- [ ] B'];
    expect(moveBlock(lines.join('\n'), 0, 2, 1)).toBe(lines.join('\n'));
  });
});

import { sortTodayBlocks } from '../../src/core/sort';

describe('sortTodayBlocks', () => {
  it('orders today blocks by projected start, moving memos with them', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 오후 @ 15:00 ; 1:00',
      '오후 메모',
      '- [ ] 아침 @ 9:00 ; 1:00',
      '아침 메모',
    ].join('\n');
    const { content: out, changed } = sortTodayBlocks(content, '2026-06-02');
    expect(changed).toBe(true);
    expect(out.split('\n')).toEqual([
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 아침 @ 9:00 ; 1:00',
      '아침 메모',
      '- [ ] 오후 @ 15:00 ; 1:00',
      '오후 메모',
    ]);
  });

  it('leaves the below region untouched and is a no-op when already sorted', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 아침 @ 9:00 ; 1:00',
      '- [ ] 오후 @ 15:00 ; 1:00',
      '---',
      '- [ ] 나중 ; 3:00',
    ].join('\n');
    expect(sortTodayBlocks(content, '2026-06-02').changed).toBe(false);
  });
});

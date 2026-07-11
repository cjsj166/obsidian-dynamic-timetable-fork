import { applyLayoutString } from '../../src/core/layout';

const seq = () => {
  let n = 0;
  return () => `g${++n}`;
};

describe('layoutToday', () => {
  it('stamps an id and inserts a continuation block at the segment start', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00', // 09:00–11:00 + 13:00–15:00
      'morning memo',
      '- [ ] 미팅 @ 11:00 ; 1:00',
      'mtg memo',
      '- [ ] 점심 @ 12:00 ; 1:00',
    ].join('\n');
    const { content: out } = applyLayoutString(content, seq(), '2026-06-02');
    expect(out.split('\n')).toEqual([
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00 ^g1',
      'morning memo',
      '- [ ] 미팅 @ 11:00 ; 1:00',
      'mtg memo',
      '- [ ] 점심 @ 12:00 ; 1:00',
      '%%task:g1 2/2%%',
    ]);
  });

  it('merges a continuation back into the primary when the split collapses', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00 ^g1', // no appointment now → single segment
      'morning',
      '%%task:g1 2/2%%',
      'afternoon',
    ].join('\n');
    const { content: out } = applyLayoutString(content, seq(), '2026-06-02');
    expect(out.split('\n')).toEqual([
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00 ^g1',
      'morning',
      'afternoon',
    ]);
  });

  it('untimed memo checkbox stays with its timed task block (condition #2)', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] A ; 2:00',
      '- [ ] memo box',
      '- [ ] B ; 1:00',
    ].join('\n');
    const { content: out } = applyLayoutString(content, seq(), '2026-06-02');
    const lines = out.split('\n');
    const aIdx = lines.findIndex((l) => l.includes('A ; 2:00'));
    const memoIdx = lines.findIndex((l) => l.includes('memo box'));
    const bIdx = lines.findIndex((l) => l.includes('B ; 1:00'));
    expect(memoIdx).toBeGreaterThan(aIdx);
    expect(memoIdx).toBeLessThan(bIdx);
    expect(lines.filter((l) => l.includes('memo box'))).toHaveLength(1);
  });

  it('preserves untimed memos on re-sort (multiset preservation)', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] B ; 1:00',
      '- [ ] memo for B',
      '- [ ] A @ 9:00 ; 1:00',
      '- [ ] memo for A',
    ].join('\n');
    const { content: out } = applyLayoutString(content, seq(), '2026-06-02');
    const lines = out.split('\n');
    expect(lines.filter((l) => l.includes('memo for A'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('memo for B'))).toHaveLength(1);
    const aIdx = lines.findIndex((l) => l.includes('A @'));
    const memoAIdx = lines.findIndex((l) => l.includes('memo for A'));
    expect(memoAIdx).toBeGreaterThan(aIdx);
  });

  it('untimed memo does not get ^id attached', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00',
      '- [ ] memo checkbox',
      '- [ ] 미팅 @ 11:00 ; 1:00',
      '- [ ] 점심 @ 12:00 ; 1:00',
    ].join('\n');
    const { content: out } = applyLayoutString(content, seq(), '2026-06-02');
    const memoLine = out.split('\n').find((l) => l.includes('memo checkbox'));
    expect(memoLine).toBeDefined();
    expect(memoLine).not.toMatch(/\^/);
  });

  it('is idempotent', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00',
      '- [ ] 미팅 @ 11:00 ; 1:00',
      '- [ ] 점심 @ 12:00 ; 1:00',
    ].join('\n');
    const once = applyLayoutString(content, seq(), '2026-06-02').content;
    const twice = applyLayoutString(once, seq(), '2026-06-02');
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once);
  });
});

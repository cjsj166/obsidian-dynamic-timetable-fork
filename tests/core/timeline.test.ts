import { resolveTimeline } from '../../src/core/timeline';

const HM = (h: number, m = 0) => h * 60 + m;
const byName = (rows: any[], name: string) => rows.find((r) => r.name === name);

describe('resolveTimeline', () => {
  it('labels today tasks inline, with multi-range for a split task', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00', // 09:00–11:00 + 12:00–14:00 around 미팅
      '메모 한 줄', // inline memo — ignored by the task parser
      '- [ ] 미팅 @ 11:00 ; 1:00',
    ].join('\n');
    const { rows } = resolveTimeline(content, '2026-06-02');

    const big = byName(rows, '긴 작업');
    expect(big.kind).toBe('today');
    expect(big.timeLabel).toBe('09:00–11:00, 12:00–14:00');
    expect(big.startMin).toBe(HM(9));
    expect(big.endMin).toBe(HM(14));
    expect(big.splitCount).toBe(2);

    const m = byName(rows, '미팅');
    expect(m.timeLabel).toBe('11:00–12:00');
    expect(m.fixed).toBe(true);
  });

  it('reports today gaps and block boundaries', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 출근 @ 10:00 ; 1:00', // gap 09:00–10:00 before it
      '- [ ] 미팅 @ 14:00 ; 1:00', // gap 11:00–14:00 between
    ].join('\n');
    const { gaps, boundaries } = resolveTimeline(content, '2026-06-02');
    expect(gaps.map((g) => [g.startMin, g.endMin])).toEqual([
      [HM(9), HM(10)],
      [HM(11), HM(14)],
    ]);
    expect(boundaries).toEqual([...boundaries].sort((a, b) => a - b));
    expect(boundaries.length).toBe(2);
  });

  it('labels below tasks with date and projected clock range', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 오늘 ; 1:00',
      '---',
      '- [ ] 나중 ; 3:00',
    ].join('\n');
    const { rows } = resolveTimeline(content, '2026-06-02');
    const later = byName(rows, '나중');
    expect(later.kind).toBe('below');
    expect(later.timeLabel).toMatch(/^→ /);
    expect(later.endDate).not.toBeNull();
  });
});

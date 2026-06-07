import { computeRuler } from '../../src/core/ruler';

describe('computeRuler', () => {
  it('returns one entry per today task with its segments and active minutes', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00 ^a', // 09:00–11:00 + 12:00–14:00 (split around 미팅)
      '- [ ] 미팅 @ 11:00 ; 1:00 ^b', // 11:00–12:00
      '%%task:a%%',
      'memo a',
      '%%task:b%%',
      'memo b',
    ].join('\n');
    const entries = computeRuler(content, '2026-06-02');

    const a = entries.find((e) => e.id === 'a')!;
    expect(a.segments.map((s) => [s.startMin, s.endMin])).toEqual([
      [9 * 60, 11 * 60],
      [12 * 60, 14 * 60],
    ]);
    expect(a.startMin).toBe(9 * 60);
    expect(a.endMin).toBe(14 * 60);
    expect(a.activeMin).toBe(4 * 60);
    expect(a.gapBefore).toBeNull();

    const b = entries.find((e) => e.id === 'b')!;
    expect(b.segments).toEqual([{ startMin: 11 * 60, endMin: 12 * 60 }]);
    expect(b.activeMin).toBe(60);
  });

  it('attaches an idle gap that ends at a task start', () => {
    const content = [
      '---',
      'day_start: 9:00',
      '---',
      '- [ ] 미팅 @ 11:00 ; 1:00 ^a', // gap 09:00–11:00 before it
      '%%task:a%%',
      'memo',
    ].join('\n');
    const a = computeRuler(content, '2026-06-02').find((e) => e.id === 'a')!;
    expect(a.gapBefore).toEqual({ startMin: 9 * 60, endMin: 11 * 60 });
  });

  it('excludes below tasks (ruler is today-only)', () => {
    const content = [
      '---',
      '---',
      '- [ ] today ; 1:00 ^t',
      '---',
      '- [ ] later ; 3:00 ^b',
      '%%task:t%%',
      'a',
      '%%task:b%%',
      'b',
    ].join('\n');
    const entries = computeRuler(content, '2026-06-02');
    expect(entries.map((e) => e.id)).toEqual(['t']);
  });
});

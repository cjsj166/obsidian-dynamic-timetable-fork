import { computeRuler } from '../../src/core/ruler';

describe('computeRuler', () => {
  it('returns one entry per today block (split task = one per segment)', () => {
    const content = [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00 ^a', // 09:00–11:00 + 12:00–14:00 (split around 미팅)
      '- [ ] 미팅 @ 11:00 ; 1:00 ^b', // 11:00–12:00
      '%%task:a%%', // first segment block
      'memo a1',
      '%%task:b%%',
      'memo b',
      '%%task:a%%', // second segment block
      'memo a2',
    ].join('\n');
    const entries = computeRuler(content, '2026-06-02');

    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'a']);
    expect([entries[0].startMin, entries[0].endMin]).toEqual([9 * 60, 11 * 60]);
    expect(entries[0].activeMin).toBe(120);
    expect([entries[1].startMin, entries[1].endMin]).toEqual([11 * 60, 12 * 60]);
    expect([entries[2].startMin, entries[2].endMin]).toEqual([12 * 60, 14 * 60]);
    expect(entries[2].activeMin).toBe(120);
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

import { computeMarkerHeaders } from '../../src/core/headers';

const HM = (h: number, m = 0) => h * 60 + m;

describe('computeMarkerHeaders', () => {
  const content = [
    '---',
    'working_hours: 8:00',
    'day_start: 9:00',
    '---',
    '- [ ] 출근 @ 9:00 ^t1',
    '- [ ] 긴 작업 ; 4:00 ^t2',
    '- [ ] 미팅 @ 11:00 ; 1:00 ^t3',
    '---',
    '- [ ] 큰 작업 A ; 7:00 ^b1',
    '%%task:t1%%',
    '출근 메모',
    '%%task:t2%%',
    '긴 작업 메모',
    '%%task:t3%%',
    '미팅 메모',
    '%%task:b1%%',
    'below 메모',
    '%%task:gone%%',
    '삭제된 태스크 메모',
  ].join('\n');

  const headers = computeMarkerHeaders(content, '2026-06-02');
  const byId = Object.fromEntries(headers.map((h) => [h.id, h]));

  it('produces one header per marker in order', () => {
    expect(headers.map((h) => h.id)).toEqual(['t1', 't2', 't3', 'b1', 'gone']);
  });

  it('labels a today task with its projected span', () => {
    expect(byId.t1.section).toBe('today');
    expect(byId.t1.name).toBe('출근');
    expect(byId.t1.timeLabel).toBe('09:00–09:00');
    expect(byId.t1.fixed).toBe(true);
  });

  it('shows each segment range for a task split around a fixed appointment', () => {
    // 긴 작업 (4h) fills 09:00–11:00, then 12:00–14:00 around the 11:00 meeting.
    expect(byId.t2.section).toBe('today');
    expect(byId.t2.timeLabel).toBe('09:00–11:00, 12:00–14:00');
    expect(byId.t2.splitCount).toBe(2);
  });

  it('labels a below task with its end date', () => {
    expect(byId.b1.section).toBe('below');
    expect(byId.b1.timeLabel).toMatch(/^→ /);
    expect(byId.b1.name).toBe('큰 작업 A');
  });

  it('flags an orphan marker', () => {
    expect(byId.gone.orphan).toBe(true);
    expect(byId.gone.name).toBeNull();
    expect(byId.gone.timeLabel).toBe('?');
  });
});

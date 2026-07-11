import { parseDocument } from '../../src/core/document';
import {
  capacityFor,
  projectBelow,
  projectToday,
} from '../../src/core/projection';
import { parseFrontmatter } from '../../src/core/document';

const HM = (h: number, m = 0) => h * 60 + m;

// Helper: index rows by [name, segmentIndex] for order-independent assertions.
const seg = (rows: any[], name: string, idx = 0) =>
  rows.find((r) => r.task.name === name && r.segmentIndex === idx);

describe('projectToday — fixture 1 (fixed appointments + flexible fill)', () => {
  const doc = parseDocument(
    [
      '---',
      'working_hours: 8:00',
      'day_start: 9:00',
      '---',
      '- [ ] 출근 @ 9:00',
      '- [ ] 메일 확인 ; 0:10',
      '- [ ] 점심시간 @ 11:45 ; 1:00',
      '- [ ] 할 거 1 @ 13:00 ; 2:00',
      '- [ ] 할 거 2 ; 1:00',
    ].join('\n')
  );
  const proj = projectToday(
    doc.today,
    doc.frontmatter.dayStartMin,
    capacityFor(doc.frontmatter, '2026-06-01')
  );

  it('places fixed appointments at their anchors', () => {
    expect([
      seg(proj.rows, '점심시간').startMin,
      seg(proj.rows, '점심시간').endMin,
    ]).toEqual([HM(11, 45), HM(12, 45)]);
    expect([
      seg(proj.rows, '할 거 1').startMin,
      seg(proj.rows, '할 거 1').endMin,
    ]).toEqual([HM(13), HM(15)]);
    expect(seg(proj.rows, '점심시간').fixed).toBe(true);
  });

  it('fills flexible work from day_start into the early gap', () => {
    expect([
      seg(proj.rows, '메일 확인').startMin,
      seg(proj.rows, '메일 확인').endMin,
    ]).toEqual([HM(9), HM(9, 10)]);
    expect([
      seg(proj.rows, '할 거 2').startMin,
      seg(proj.rows, '할 거 2').endMin,
    ]).toEqual([HM(9, 10), HM(10, 10)]);
  });

  it('sorts rows by start time', () => {
    const starts = proj.rows.map((r) => r.startMin);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('summarizes the day', () => {
    expect(proj.clockEndMin).toBe(HM(15));
    expect(proj.workTotalMin).toBe(HM(4, 10));
    expect(proj.capacityMin).toBe(HM(8));
    expect(proj.overBudget).toBe(false);
    expect(proj.hasConflict).toBe(false);
  });
});

describe('projectToday — fixture 2 (split around a fixed appointment)', () => {
  const doc = parseDocument(
    [
      '---',
      'working_hours: 7:00',
      'day_start: 9:00',
      '---',
      '- [ ] 긴 작업 ; 4:00',
      '- [ ] 미팅 @ 11:00 ; 1:00',
    ].join('\n')
  );
  const proj = projectToday(
    doc.today,
    doc.frontmatter.dayStartMin,
    capacityFor(doc.frontmatter, 'x')
  );

  it('splits the flexible task before/after the appointment', () => {
    const a1 = seg(proj.rows, '긴 작업', 0);
    const a2 = seg(proj.rows, '긴 작업', 1);
    expect([a1.startMin, a1.endMin]).toEqual([HM(9), HM(11)]);
    expect([a2.startMin, a2.endMin]).toEqual([HM(12), HM(14)]);
    expect(a1.segmentCount).toBe(2);
    expect(a2.segmentCount).toBe(2);
  });

  it('keeps the appointment fixed at its anchor', () => {
    const m = seg(proj.rows, '미팅');
    expect([m.startMin, m.endMin]).toEqual([HM(11), HM(12)]);
    expect(m.fixed).toBe(true);
  });

  it('renders the timeline in order: A(1/2), 미팅, A(2/2)', () => {
    expect(proj.rows.map((r) => [r.task.name, r.segmentIndex])).toEqual([
      ['긴 작업', 0],
      ['미팅', 0],
      ['긴 작업', 1],
    ]);
  });
});

describe('projectToday — idle gaps', () => {
  it('reports a gap from day_start to the first task and between tasks', () => {
    const doc = parseDocument(
      [
        '---',
        'day_start: 9:00',
        '---',
        '- [ ] 출근 @ 10:00 ; 1:00', // 10:00–11:00 (gap 09:00–10:00 before it)
        '- [ ] 미팅 @ 14:00 ; 1:00', // 14:00–15:00 (gap 11:00–14:00 between)
      ].join('\n')
    );
    const proj = projectToday(doc.today, doc.frontmatter.dayStartMin, HM(8));
    expect(proj.gaps.map((g) => [g.startMin, g.endMin])).toEqual([
      [HM(9), HM(10)],
      [HM(11), HM(14)],
    ]);
  });

  it('reports no gap inside a task split around an appointment', () => {
    // 긴 작업 fills 09:00–11:00 then 12:00–14:00; the 11:00 meeting fills the
    // middle, so there is no idle gap.
    const doc = parseDocument(
      [
        '---',
        'day_start: 9:00',
        '---',
        '- [ ] 긴 작업 ; 4:00',
        '- [ ] 미팅 @ 11:00 ; 1:00',
      ].join('\n')
    );
    const proj = projectToday(doc.today, doc.frontmatter.dayStartMin, HM(7));
    expect(proj.gaps).toEqual([]);
  });
});

describe('projectToday — overlapping fixed appointments', () => {
  const doc = parseDocument(
    ['---', '---', '- [ ] A @ 10:00 ; 2:00', '- [ ] B @ 11:00 ; 1:00'].join(
      '\n'
    )
  );
  const proj = projectToday(
    doc.today,
    HM(9),
    capacityFor(doc.frontmatter, 'x')
  );

  it('flags the conflict', () => {
    expect(proj.hasConflict).toBe(true);
    expect(proj.rows.every((r) => r.conflict)).toBe(true);
  });
});

describe('projectBelow — fixture 3 (simple queue)', () => {
  const fm = parseFrontmatter(
    [
      'working_hours: 7:00',
      'capacity_overrides:',
      '  - 2026-06-02 +1:00',
      '  - 2026-06-04 -1:00',
    ].join('\n')
  );
  const doc = parseDocument(
    [
      '---',
      '- [ ] 할 거 3 ; 7:00',
      '- [ ] 할 거 4 ; 8:00',
      '- [ ] 할 거 5 ; 8:00',
    ].join('\n')
  );
  const proj = projectBelow(doc.below, fm, '2026-06-01');

  it('distributes tasks across days by capacity', () => {
    expect(proj.rows.map((r) => [r.endDate, r.endHoursIntoDayMin])).toEqual([
      ['2026-06-02', HM(7)],
      ['2026-06-03', HM(7)],
      ['2026-06-05', HM(2)],
    ]);
    expect(proj.overBookedDates).toEqual([]);
  });
});

describe('projectBelow — fixture 4 (date-pinned)', () => {
  const fm = parseFrontmatter('working_hours: 7:00');
  const doc = parseDocument(
    [
      '---',
      '- [ ] 할 거 3 ; 5:00',
      '- [ ] 거래처 미팅 @ 2026-06-03 14:00 ; 2:00',
      '- [ ] 할 거 4 ; 6:00',
    ].join('\n')
  );
  const proj = projectBelow(doc.below, fm, '2026-06-01');

  it('reserves pinned time and fills the rest around it', () => {
    const byName = Object.fromEntries(proj.rows.map((r) => [r.task.name, r]));
    expect(byName['거래처 미팅'].pinned).toBe(true);
    expect(byName['거래처 미팅'].endDate).toBe('2026-06-03');
    expect([
      byName['할 거 3'].endDate,
      byName['할 거 3'].endHoursIntoDayMin,
    ]).toEqual(['2026-06-02', HM(5)]);
    expect([
      byName['할 거 4'].endDate,
      byName['할 거 4'].endHoursIntoDayMin,
    ]).toEqual(['2026-06-03', HM(6)]);
  });
});

describe('projectBelow — over-booked pinned date', () => {
  const fm = parseFrontmatter('working_hours: 7:00');
  const doc = parseDocument(
    ['---', '- [ ] big meeting @ 2026-06-03 09:00 ; 8:00'].join('\n')
  );
  const proj = projectBelow(doc.below, fm, '2026-06-01');
  it('flags the date', () => {
    expect(proj.overBookedDates).toEqual(['2026-06-03']);
  });
});

describe('projectToday — untimed checkboxes excluded', () => {
  it('does not create TodayRow for untimed today tasks', () => {
    const doc = parseDocument(
      [
        '---',
        'day_start: 9:00',
        '---',
        '- [ ] A @ 9:00 ; 1:00',
        '- [ ] untimed memo',
        '- [ ] B ; 0:30',
      ].join('\n')
    );
    const proj = projectToday(doc.today, doc.frontmatter.dayStartMin, HM(7));
    expect(proj.rows.map((r) => r.task.name)).toEqual(['A', 'B']);
  });
});

import { parseDocument } from '../../src/core/document';
import {
  capacityFor,
  projectBelow,
  projectToday,
} from '../../src/core/projection';
import { parseFrontmatter } from '../../src/core/document';

const HM = (h: number, m = 0) => h * 60 + m;

describe('projectToday — fixture 1', () => {
  const doc = parseDocument(
    [
      '---',
      'working_hours: 8:00',
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
    HM(9),
    capacityFor(doc.frontmatter, '2026-06-01')
  );

  it('cascades start/end clocks', () => {
    expect(proj.rows.map((r) => [r.startMin, r.endMin])).toEqual([
      [HM(9), HM(9)],
      [HM(9), HM(9, 10)],
      [HM(11, 45), HM(12, 45)],
      [HM(13), HM(15)],
      [HM(15), HM(16)],
    ]);
  });

  it('computes buffers (null when no anchor)', () => {
    expect(proj.rows.map((r) => r.bufferMin)).toEqual([
      0,
      null,
      HM(2, 35),
      HM(0, 15),
      null,
    ]);
  });

  it('summarizes the day', () => {
    expect(proj.clockEndMin).toBe(HM(16));
    expect(proj.workTotalMin).toBe(HM(4, 10));
    expect(proj.capacityMin).toBe(HM(8));
    expect(proj.overBudget).toBe(false);
  });
});

describe('projectToday — fixture 2 (negative buffer)', () => {
  const doc = parseDocument(
    ['---', 'working_hours: 7:00', '---', '- [ ] 긴 작업 ; 4:00', '- [ ] 미팅 @ 11:00 ; 1:00'].join(
      '\n'
    )
  );
  const proj = projectToday(doc.today, HM(9), capacityFor(doc.frontmatter, 'x'));

  it('projects a late start as a negative buffer', () => {
    expect(proj.rows[0].startMin).toBe(HM(9));
    expect(proj.rows[0].endMin).toBe(HM(13));
    expect(proj.rows[1].startMin).toBe(HM(13));
    expect(proj.rows[1].endMin).toBe(HM(14));
    expect(proj.rows[1].bufferMin).toBe(-HM(2));
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
    ['---', '- [ ] 할 거 3 ; 7:00', '- [ ] 할 거 4 ; 8:00', '- [ ] 할 거 5 ; 8:00'].join('\n')
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
    const byName = Object.fromEntries(
      proj.rows.map((r) => [r.task.name, r])
    );
    expect(byName['거래처 미팅'].pinned).toBe(true);
    expect(byName['거래처 미팅'].endDate).toBe('2026-06-03');
    expect([byName['할 거 3'].endDate, byName['할 거 3'].endHoursIntoDayMin]).toEqual([
      '2026-06-02',
      HM(5),
    ]);
    expect([byName['할 거 4'].endDate, byName['할 거 4'].endHoursIntoDayMin]).toEqual([
      '2026-06-03',
      HM(6),
    ]);
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

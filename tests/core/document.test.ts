import {
  parseDocument,
  parseFrontmatter,
  parseTaskLine,
  splitFrontmatter,
  isTimedTaskLine,
} from '../../src/core/document';
import { DEFAULT_WORKING_HOURS_MIN } from '../../src/core/types';

describe('parseTaskLine', () => {
  it('parses name + anchor + duration', () => {
    const t = parseTaskLine('- [ ] 점심시간 @ 11:45 ; 1:00', 0)!;
    expect(t.status).toBe('open');
    expect(t.name).toBe('점심시간');
    expect(t.anchorMinutes).toBe(705);
    expect(t.anchorDate).toBeNull();
    expect(t.durationMin).toBe(60);
  });

  it('supports both token orders', () => {
    const a = parseTaskLine('- [ ] foo @ 13:00 ; 2:00', 0)!;
    const b = parseTaskLine('- [ ] foo ; 2:00 @ 13:00', 0)!;
    expect(a.anchorMinutes).toBe(780);
    expect(a.durationMin).toBe(120);
    expect(b.anchorMinutes).toBe(780);
    expect(b.durationMin).toBe(120);
  });

  it('parses integer-minute durations', () => {
    expect(parseTaskLine('- [ ] mail ; 10', 0)!.durationMin).toBe(10);
  });

  it('parses completed status', () => {
    expect(parseTaskLine('- [x] done thing ; 30', 0)!.status).toBe('done');
  });

  it('parses date-pinned anchor for below tasks', () => {
    const t = parseTaskLine('- [ ] 거래처 미팅 @ 2026-06-03 14:00 ; 1:00', 0)!;
    expect(t.anchorDate).toBe('2026-06-03');
    expect(t.anchorMinutes).toBe(840);
    expect(t.durationMin).toBe(60);
    expect(t.name).toBe('거래처 미팅');
  });

  it('collects #tags as categories and strips them from the name', () => {
    const t = parseTaskLine('- [ ] write #work #docs ; 30', 0)!;
    expect(t.categories).toEqual(['work', 'docs']);
    expect(t.name).toBe('write');
  });

  it('returns null for non-task lines', () => {
    expect(parseTaskLine('just a note', 0)).toBeNull();
    expect(parseTaskLine('# heading', 0)).toBeNull();
  });

  it('flags a decimal duration as a parse error', () => {
    const t = parseTaskLine('- [ ] 할 거 ; 1.5', 0)!;
    expect(t.parseError).toMatch(/invalid duration "1\.5"/);
    expect(t.durationMin).toBeNull();
  });

  it('flags an out-of-range @ time as a parse error', () => {
    const t = parseTaskLine('- [ ] thing @ 25:00', 0)!;
    expect(t.parseError).toMatch(/invalid time "25:00"/);
    expect(t.anchorMinutes).toBeNull();
  });

  it('leaves a literal @ in the name when it is not a time', () => {
    const t = parseTaskLine('- [ ] mail foo@bar.com ; 30', 0)!;
    expect(t.parseError).toBeNull();
    expect(t.name).toBe('mail foo@bar.com');
    expect(t.durationMin).toBe(30);
  });

  it('accepts both H:MM and integer minutes without error', () => {
    expect(parseTaskLine('- [ ] a ; 1:30', 0)!.parseError).toBeNull();
    expect(parseTaskLine('- [ ] a ; 1:30', 0)!.durationMin).toBe(90);
    expect(parseTaskLine('- [ ] a ; 90', 0)!.parseError).toBeNull();
  });
});

describe('isTimedTaskLine', () => {
  it('returns true for @ time', () => {
    expect(isTimedTaskLine('- [ ] 출근 @ 9:00')).toBe(true);
  });

  it('returns true for ; duration only', () => {
    expect(isTimedTaskLine('- [ ] 메일 ; 30')).toBe(true);
  });

  it('returns true for parse-error time (still a timed task)', () => {
    expect(isTimedTaskLine('- [ ] thing @ 25:00')).toBe(true);
  });

  it('returns false for plain checkbox without time', () => {
    expect(isTimedTaskLine('- [ ] 그냥 할 일')).toBe(false);
  });

  it('returns false for nested indented checkbox without time', () => {
    expect(isTimedTaskLine('  - [ ] nested todo')).toBe(false);
  });

  it('returns false for done checkbox without time', () => {
    expect(isTimedTaskLine('- [x] done thing')).toBe(false);
  });

  it('returns false for email @ in name (not a time)', () => {
    expect(isTimedTaskLine('- [ ] mail foo@bar.com')).toBe(false);
  });

  it('returns false for non-checkbox lines', () => {
    expect(isTimedTaskLine('just a note')).toBe(false);
    expect(isTimedTaskLine('# heading')).toBe(false);
  });
});

describe('parseFrontmatter', () => {
  it('defaults working_hours to 7:00', () => {
    expect(parseFrontmatter(null).workingHoursMin).toBe(
      DEFAULT_WORKING_HOURS_MIN
    );
  });

  it('parses working_hours and capacity_overrides', () => {
    const fm = parseFrontmatter(
      [
        'working_hours: 7:00',
        'capacity_overrides:',
        '  - 2026-06-02 +1:00',
        '  - 2026-06-04 -1:00',
      ].join('\n')
    );
    expect(fm.workingHoursMin).toBe(420);
    expect(fm.capacityOverrides).toEqual([
      { date: '2026-06-02', deltaMin: 60 },
      { date: '2026-06-04', deltaMin: -60 },
    ]);
    expect(fm.error).toBeNull();
  });

  it('flags an override without a sign as an error', () => {
    const fm = parseFrontmatter(
      ['capacity_overrides:', '  - 2026-06-02 1:00'].join('\n')
    );
    expect(fm.error).toMatch(/capacity_overrides/);
    expect(fm.capacityOverrides).toHaveLength(0);
  });

  it('defaults day_start to 9:00 and parses an override', () => {
    expect(parseFrontmatter(null).dayStartMin).toBe(9 * 60);
    expect(parseFrontmatter('day_start: 8:30').dayStartMin).toBe(8 * 60 + 30);
  });

  it('flags an invalid day_start', () => {
    const fm = parseFrontmatter('day_start: 25:00');
    expect(fm.error).toMatch(/day_start/);
    expect(fm.dayStartMin).toBe(9 * 60);
  });
});

describe('splitFrontmatter', () => {
  it('separates frontmatter from body with correct offset', () => {
    const content = ['---', 'working_hours: 8:00', '---', '- [ ] a ; 30'].join(
      '\n'
    );
    const r = splitFrontmatter(content);
    expect(r.frontmatterText).toBe('working_hours: 8:00');
    expect(r.bodyLines).toEqual(['- [ ] a ; 30']);
    expect(r.bodyOffset).toBe(3);
  });

  it('handles a document with no frontmatter', () => {
    const r = splitFrontmatter('- [ ] a ; 30');
    expect(r.frontmatterText).toBeNull();
    expect(r.bodyOffset).toBe(0);
  });
});

describe('parseDocument', () => {
  it('splits today / below at the divider (fixture 1 + 3 shape)', () => {
    const content = [
      '---',
      'working_hours: 8:00',
      '---',
      '- [ ] 출근 @ 9:00',
      '- [ ] 메일 확인 ; 0:10',
      '---',
      '- [ ] 할 거 3 ; 7:00',
      '- [ ] 할 거 4 ; 8:00',
    ].join('\n');

    const doc = parseDocument(content);
    expect(doc.hasDivider).toBe(true);
    expect(doc.frontmatter.workingHoursMin).toBe(480);
    expect(doc.today.map((t) => t.name)).toEqual(['출근', '메일 확인']);
    expect(doc.below.map((t) => t.name)).toEqual(['할 거 3', '할 거 4']);
    // absolute line numbers are preserved for later file rewrites
    expect(doc.today[0].lineNo).toBe(3);
    expect(doc.below[0].lineNo).toBe(6);
  });

  it('treats the whole body as today when there is no divider', () => {
    const doc = parseDocument('- [ ] a ; 30\n- [ ] b ; 30');
    expect(doc.hasDivider).toBe(false);
    expect(doc.today).toHaveLength(2);
    expect(doc.below).toHaveLength(0);
  });

  it('ignores free text and blank lines between tasks', () => {
    const doc = parseDocument(
      ['- [ ] a ; 30', '', 'some memo', '- [ ] b ; 30'].join('\n')
    );
    expect(doc.today.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('excludes untimedcheckbox lines from today/below', () => {
    const content = [
      '- [ ] 출근 @ 9:00',
      '- [ ] 그냥 할 일',
      '- [ ] 메일 ; 0:30',
    ].join('\n');
    const doc = parseDocument(content);
    expect(doc.today.map((t) => t.name)).toEqual(['출근', '메일']);
  });

  it('excludes nested untimed checkboxes', () => {
    const content = [
      '- [ ] 출근 @ 9:00',
      '  - [ ] nested memo box',
      '- [ ] 메일 ; 0:30',
    ].join('\n');
    const doc = parseDocument(content);
    expect(doc.today.map((t) => t.name)).toEqual(['출근', '메일']);
  });

  it('preserves lineNo of surviving timed tasks', () => {
    const content = ['- [ ] A @ 9:00', '- [ ] untimed', '- [ ] B ; 1:00'].join(
      '\n'
    );
    const doc = parseDocument(content);
    expect(doc.today[0].lineNo).toBe(0);
    expect(doc.today[1].lineNo).toBe(2);
  });

  it('excludes top-level untimed todos (no preceding timed task)', () => {
    const content = ['- [ ] orphan untimed', '- [ ] A @ 9:00'].join('\n');
    const doc = parseDocument(content);
    expect(doc.today.map((t) => t.name)).toEqual(['A']);
  });

  it('does not let --- adjacent untimed become divider', () => {
    const content = [
      '- [ ] A @ 9:00',
      '- [ ] untimed memo',
      '---',
      '- [ ] below ; 1:00',
    ].join('\n');
    const doc = parseDocument(content);
    expect(doc.hasDivider).toBe(true);
    expect(doc.today.map((t) => t.name)).toEqual(['A']);
    expect(doc.below.map((t) => t.name)).toEqual(['below']);
  });

  it('warns when frontmatter keys appear without the opening --- fence', () => {
    const doc = parseDocument(
      ['working_hours: 7:00', 'day_start: 9:00', '---', '- [ ] a ; 30'].join(
        '\n'
      )
    );
    expect(doc.frontmatter.error).toMatch(/펜스/);
    // and the keys were NOT applied (defaults remain)
    expect(doc.frontmatter.workingHoursMin).toBe(7 * 60);
  });
});

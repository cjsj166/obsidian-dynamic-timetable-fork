import {
  analyzeNotes,
  findFirstMarkerLine,
  matchTaskNotes,
  parseNoteSegments,
  parseTaskRegion,
} from '../../src/core/notes';
import { parseTaskLine } from '../../src/core/document';

describe('parseTaskLine — block id', () => {
  it('extracts a trailing ^id and strips it from the name', () => {
    const t = parseTaskLine('- [ ] 아침 집중 작업 ; 3:00 ^a3f', 0)!;
    expect(t.id).toBe('a3f');
    expect(t.name).toBe('아침 집중 작업');
    expect(t.durationMin).toBe(180);
  });

  it('leaves id null when absent and ignores a mid-name caret', () => {
    expect(parseTaskLine('- [ ] plain task', 0)!.id).toBeNull();
    // no whitespace before ^, so not a block id
    expect(parseTaskLine('- [ ] 2^3 math', 0)!.id).toBeNull();
  });
});

describe('parseNoteSegments', () => {
  const lines = [
    '%%task:a%%',
    'note for a',
    'line two',
    '%%task:b%%',
    'note for b',
  ];
  it('splits segments by marker and captures id + body', () => {
    const segs = parseNoteSegments(lines);
    expect(segs.map((s) => s.id)).toEqual(['a', 'b']);
    expect(segs[0]).toMatchObject({ markerLineNo: 0, bodyStart: 1, bodyEnd: 3 });
    expect(segs[0].text).toBe('note for a\nline two');
    expect(segs[1].text).toBe('note for b');
  });

  it('findFirstMarkerLine reports the first marker index', () => {
    expect(findFirstMarkerLine(lines)).toBe(0);
    expect(findFirstMarkerLine(['- [ ] x', 'memo'])).toBeNull();
  });
});

describe('parseTaskRegion — divider safety', () => {
  it('does not treat a --- inside a note as the today/below divider', () => {
    const content = [
      '- [ ] 출근 @ 9:00 ^t1',
      '- [ ] 점심 @ 12:00 ^t2',
      '%%task:t1%%',
      'first',
      '---', // horizontal rule inside a note — must NOT split today/below
      'second',
    ].join('\n');
    const doc = parseTaskRegion(content);
    expect(doc.hasDivider).toBe(false);
    expect(doc.today.map((t) => t.name)).toEqual(['출근', '점심']);
    expect(doc.below).toHaveLength(0);
  });

  it('still honors a real today/below divider in the task region', () => {
    const content = [
      '- [ ] a ^t1',
      '---',
      '- [ ] b ^t2',
      '%%task:t1%%',
      'note',
    ].join('\n');
    const doc = parseTaskRegion(content);
    expect(doc.hasDivider).toBe(true);
    expect(doc.today.map((t) => t.name)).toEqual(['a']);
    expect(doc.below.map((t) => t.name)).toEqual(['b']);
  });
});

describe('matchTaskNotes — by id', () => {
  const content = [
    '- [ ] 회의 @ 9:00 ^m1',
    '- [ ] 회의 @ 14:00 ^m2', // same name, different id
    '- [ ] 새 태스크 ; 1:00', // no id yet
    '%%task:m2%%',
    'afternoon meeting note',
    '%%task:m1%%',
    'morning meeting note',
    '%%task:gone%%', // orphan: no task has id "gone"
    'leftover note',
  ].join('\n');
  const a = analyzeNotes(content);

  it('matches duplicate-named tasks to the correct segment by id', () => {
    const m1 = a.pairs.find((p) => p.task.id === 'm1')!;
    const m2 = a.pairs.find((p) => p.task.id === 'm2')!;
    expect(m1.task.name).toBe('회의');
    expect(m2.task.name).toBe('회의');
    expect(m1.segment!.text).toBe('morning meeting note');
    expect(m2.segment!.text).toBe('afternoon meeting note');
  });

  it('reports a task without an id as unassigned', () => {
    expect(a.unassignedTasks.map((t) => t.name)).toEqual(['새 태스크']);
  });

  it('reports a marker with no task as an orphan', () => {
    expect(a.orphanSegments.map((s) => s.id)).toEqual(['gone']);
  });

  it('keeps one pair per task in document order', () => {
    expect(a.pairs.map((p) => p.task.id)).toEqual(['m1', 'm2', null]);
  });
});

describe('matchTaskNotes — direct', () => {
  it('first marker wins on duplicate ids', () => {
    const tasks = [parseTaskLine('- [ ] x ^dup', 0)!];
    const segs = parseNoteSegments(['%%task:dup%%', 'first', '%%task:dup%%', 'second']);
    const m = matchTaskNotes(tasks, segs);
    expect(m.pairs[0].segment!.text).toBe('first');
    // the second duplicate marker is an orphan-by-shadowing? still has a task id,
    // so it is not orphaned; it simply is not the chosen match.
    expect(m.orphanSegments).toHaveLength(0);
  });
});

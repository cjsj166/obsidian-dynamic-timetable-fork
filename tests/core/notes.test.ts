import {
  analyzeNotes,
  assignIds,
  findFirstMarkerLine,
  matchTaskNotes,
  parseNoteSegments,
  parseTaskRegion,
  reorderMarkersToTasks,
  syncMarkers,
  tidyNotes,
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

describe('assignIds', () => {
  const seq = () => {
    let n = 0;
    return () => `id${++n}`;
  };

  it('stamps ^id on tasks lacking one, leaving existing ids alone', () => {
    const content = ['- [ ] a ^keep', '- [ ] b', '- [ ] c'].join('\n');
    const out = assignIds(content, seq());
    const lines = out.split('\n');
    expect(lines[0]).toBe('- [ ] a ^keep');
    expect(lines[1]).toMatch(/^- \[ \] b \^id\d+$/);
    expect(lines[2]).toMatch(/^- \[ \] c \^id\d+$/);
  });

  it('avoids colliding with an existing id', () => {
    const content = ['- [ ] a ^id1', '- [ ] b'].join('\n');
    // generator would yield id1 first (collision) then id2
    const out = assignIds(content, seq());
    expect(out.split('\n')[1]).toMatch(/\^id2$/);
  });

  it('is a no-op when every task already has an id', () => {
    const content = ['- [ ] a ^x', '- [ ] b ^y'].join('\n');
    expect(assignIds(content, seq())).toBe(content);
  });

  it('does not stamp lines in the notes region', () => {
    const content = ['- [ ] a ^x', '%%task:x%%', '- [ ] looks like a task in a note'].join('\n');
    expect(assignIds(content, seq())).toBe(content);
  });
});

describe('syncMarkers', () => {
  it('creates a marker block for each task id without one', () => {
    const content = ['- [ ] a ^x', '- [ ] b ^y'].join('\n');
    const { content: out, orphans } = syncMarkers(content);
    expect(out).toContain('%%task:x%%');
    expect(out).toContain('%%task:y%%');
    expect(orphans).toHaveLength(0);
    // re-analyzing pairs both tasks to a segment
    const a = analyzeNotes(out);
    expect(a.unassignedTasks).toHaveLength(0);
  });

  it('reports orphan markers and leaves them in place', () => {
    const content = ['- [ ] a ^x', '%%task:x%%', 'note', '%%task:gone%%', 'leftover'].join('\n');
    const { content: out, orphans } = syncMarkers(content);
    expect(orphans.map((o) => o.id)).toEqual(['gone']);
    expect(out).toContain('%%task:gone%%');
    expect(out).toContain('leftover');
  });

  it('is a no-op when every id already has a marker', () => {
    const content = ['- [ ] a ^x', '%%task:x%%', 'note'].join('\n');
    expect(syncMarkers(content).content).toBe(content);
  });
});

describe('reorderMarkersToTasks', () => {
  it('reorders marker blocks to match task order', () => {
    const content = [
      '- [ ] first ^a',
      '- [ ] second ^b',
      '%%task:b%%',
      'B body',
      '%%task:a%%',
      'A body',
    ].join('\n');
    const out = reorderMarkersToTasks(content);
    const segs = parseNoteSegments(out.split('\n'));
    expect(segs.map((s) => s.id)).toEqual(['a', 'b']);
    expect(segs[0].text).toBe('A body');
    expect(segs[1].text).toBe('B body');
  });

  it('keeps orphan markers, appended after task-ordered ones', () => {
    const content = [
      '- [ ] only ^a',
      '%%task:gone%%',
      'orphan body',
      '%%task:a%%',
      'A body',
    ].join('\n');
    const out = reorderMarkersToTasks(content);
    const segs = parseNoteSegments(out.split('\n'));
    expect(segs.map((s) => s.id)).toEqual(['a', 'gone']);
  });

  it('is idempotent', () => {
    const content = ['- [ ] a ^a', '- [ ] b ^b', '%%task:b%%', 'B', '%%task:a%%', 'A'].join('\n');
    const once = reorderMarkersToTasks(content);
    expect(reorderMarkersToTasks(once)).toBe(once);
  });
});

describe('tidyNotes', () => {
  it('assigns ids, creates markers, and orders them in one pass', () => {
    const seq = (() => {
      let n = 0;
      return () => `g${++n}`;
    })();
    const content = ['- [ ] first', '- [ ] second'].join('\n');
    const { content: out } = tidyNotes(content, seq);
    const a = analyzeNotes(out);
    expect(a.unassignedTasks).toHaveLength(0);
    expect(a.pairs.map((p) => p.task.name)).toEqual(['first', 'second']);
    expect(a.segments).toHaveLength(2);
    // ids on tasks line up with markers in order
    expect(a.pairs.map((p) => p.task.id)).toEqual(a.segments.map((s) => s.id));
  });
});

describe('reorderMarkersToTasks — by start time', () => {
  it('orders markers by projected start time, not document order', () => {
    const content = [
      '- [ ] 미팅 @ 15:00 ; 1:00 ^late',
      '- [ ] 아침 @ 9:00 ; 1:00 ^early',
      '%%task:late%%',
      'L',
      '%%task:early%%',
      'E',
    ].join('\n');
    const out = reorderMarkersToTasks(content);
    const segs = parseNoteSegments(out.split('\n'));
    expect(segs.map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('places a late-starting flexible task after an earlier fixed one', () => {
    const content = [
      '- [ ] 긴 작업 ; 3:00 ^a', // fills 09:00–12:00
      '- [ ] 점심 @ 12:00 ; 1:00 ^b', // 12:00
      '- [ ] 마무리 ; 1:00 ^c', // fills 13:00
      '%%task:c%%',
      'C',
      '%%task:b%%',
      'B',
      '%%task:a%%',
      'A',
    ].join('\n');
    const out = reorderMarkersToTasks(content);
    const segs = parseNoteSegments(out.split('\n'));
    expect(segs.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

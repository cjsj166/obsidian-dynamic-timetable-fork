import { buildViewModel, allTaskLines } from '../../src/core/viewmodel';

const HM = (h: number, m = 0) => h * 60 + m;

describe('buildViewModel', () => {
  const content = [
    '---',
    'working_hours: 8:00',
    'capacity_overrides:',
    '  - 2026-06-02 +1:00',
    '---',
    '- [ ] 출근 @ 9:00',
    '- [ ] 할 거 1 @ 13:00 ; 2:00',
    '---',
    '- [ ] 할 거 3 ; 7:00',
    '- [ ] 거래처 미팅 @ 2026-06-03 14:00 ; 2:00',
  ].join('\n');

  const vm = buildViewModel(content, '2026-06-01', HM(9));

  it('splits today / below at the divider', () => {
    expect(vm.hasDivider).toBe(true);
    expect(vm.today.rows.map((r) => r.task.name)).toEqual(['출근', '할 거 1']);
    expect(vm.below.rows.map((r) => r.task.name)).toEqual([
      '할 거 3',
      '거래처 미팅',
    ]);
  });

  it('uses the note-date capacity for today', () => {
    expect(vm.capacityMin).toBe(HM(8));
    expect(vm.today.capacityMin).toBe(HM(8));
  });

  it('projects today clocks', () => {
    expect(vm.today.rows.map((r) => [r.startMin, r.endMin])).toEqual([
      [HM(9), HM(9)],
      [HM(13), HM(15)],
    ]);
  });

  it('projects the below queue from the day after the note', () => {
    const byName = Object.fromEntries(vm.below.rows.map((r) => [r.task.name, r]));
    expect(byName['거래처 미팅'].pinned).toBe(true);
    expect(byName['거래처 미팅'].endDate).toBe('2026-06-03');
    // 할 거 3 (7h) fills 2026-06-02 which has +1:00 capacity (9h).
    expect(byName['할 거 3'].endDate).toBe('2026-06-02');
  });

  it('flattens task lines in display order', () => {
    expect(allTaskLines(vm).map((t) => t.name)).toEqual([
      '출근',
      '할 거 1',
      '할 거 3',
      '거래처 미팅',
    ]);
  });
});

describe('buildViewModel — no divider', () => {
  const vm = buildViewModel('- [ ] only today ; 1:00', '2026-06-01', HM(9));
  it('treats the whole body as today', () => {
    expect(vm.hasDivider).toBe(false);
    expect(vm.today.rows).toHaveLength(1);
    expect(vm.below.rows).toHaveLength(0);
  });
});

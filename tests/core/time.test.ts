import {
  formatClock,
  formatDuration,
  parseClock,
  parseDuration,
} from '../../src/core/time';

describe('parseDuration', () => {
  it('parses H:MM', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('0:10')).toBe(10);
    expect(parseDuration('7:00')).toBe(420);
  });
  it('parses integer minutes', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('10')).toBe(10);
  });
  it('rejects malformed durations', () => {
    expect(parseDuration('1.5')).toBeNull();
    expect(parseDuration('1:5')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats minutes as H:MM', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(420)).toBe('7:00');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-120)).toBe('-2:00');
  });
});

describe('parseClock / formatClock', () => {
  it('parses HH:MM and HHMM', () => {
    expect(parseClock('9:00')).toBe(540);
    expect(parseClock('11:45')).toBe(705);
    expect(parseClock('0900')).toBe(540);
  });
  it('rejects out-of-range', () => {
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
  });
  it('formats minutes-of-day', () => {
    expect(formatClock(540)).toBe('09:00');
    expect(formatClock(705)).toBe('11:45');
    expect(formatClock(1440)).toBe('00:00');
  });
});

# 02 — 필요없는 파일 정리

## 목적 / 왜

한 달간 한 번도 안 쓴 rollover 기능과, 버려진 사이드바 설계의 잔재(`viewmodel.ts`)를
제거해 코드 표면을 줄인다. 축 A 제출([05](05-axis-a.md)) 전 사표면을 깔끔히 하고,
축 B([04](04-axis-b.md)) 작업 범위도 좁힌다.

## 현 상태 — 미착수

두 덩어리가 제거 대상. import 그래프는 확인됨(2026-07-11).

## 세부 계획

### A. Rollover 기능 전체 제거 (한 뭉치)

`DailyNotes.ts`의 유일한 소비자가 `Rollover.ts`라, rollover를 걷어내면 함께 죽는다.
제거 범위:

- `src/Rollover.ts` (글루)
- `src/core/rollover.ts` (순수 변환)
- `src/DailyNotes.ts` (Rollover.ts 전용)
- `src/main.ts`: `runRollover` import + `roll-over` 커맨드 + 로드 시 자동 실행
  + `lastRollover` 설정 필드/기본값
- 관련 테스트: `tests/core/rollover.test.ts`(+ dailynotes 테스트 있으면)

### B. Dead code 제거
- `src/core/viewmodel.ts` — 노트를 파싱·투영해 "뷰가 그대로 그리기만 하면 되는 형태"로
  조립하던 모듈(`buildViewModel`/`allTaskLines`). 그런데 이를 그릴 **전용 뷰(사이드바)가
  설계 단계에서 폐기**돼(플러그인은 옵시디언 기본 에디터를 CodeMirror로 장식할 뿐 커스텀
  뷰가 없다), 지금은 자기 테스트(`tests/core/viewmodel.test.ts`)에서만 참조되는 죽은 코드.
- 모듈 + 해당 테스트 삭제.

### 실행 주의

삭제 전 각 심볼을 grep로 재확인(import 그래프가 그새 바뀌지 않았는지), 삭제 후 Jest 재실행.

## 완료조건

- [ ] 대상 파일이 모두 삭제됨 — `src/Rollover.ts`, `src/core/rollover.ts`,
      `src/DailyNotes.ts`, `src/core/viewmodel.ts`, `tests/core/viewmodel.test.ts`,
      `tests/core/rollover.test.ts`(존재 시). 확인:
      `ls src/Rollover.ts src/core/rollover.ts src/DailyNotes.ts src/core/viewmodel.ts 2>/dev/null | wc -l`
      → 출력 `0`이면 통과.
- [ ] `main.ts`에 rollover 배선 잔존 0:
      `grep -n "[Rr]ollover" src/main.ts` → 출력 없음.
- [ ] 코드베이스 전역 참조 0:
      `git grep -nE "[Rr]ollover|viewmodel|buildViewModel|allTaskLines|DailyNotes"`
      → 결과 없음(src·tests·문서).
- [ ] `npm run build` 성공 (tsc + 번들).
- [ ] `npx jest` green (삭제된 테스트 제외, 나머지 전부 통과).

원본: memory `cleanup-dead-code-removal` (이 문서로 흡수됨).

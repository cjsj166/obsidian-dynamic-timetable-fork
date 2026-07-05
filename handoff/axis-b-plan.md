# 축 B 검증 — 시간미지정 todo = 메모 취급 (TDD)

> 이 문서는 **야간 자율 에이전트의 구현 브리프**다. 성공은 전적으로 `npx jest` +
> `npm run build`로 검증 가능해야 하며 인앱 수동 확인은 없다. Step A~D를 각 단계
> **테스트 먼저** 작성 후 구현한다.

## Context (왜)

배포 완료조건은 두 축: **축 A**(공식 서버에서 설치 가능) + **축 B**(설치된
플러그인이 실제로 의도대로 동작). 이 계획은 **축 B**의 미착수 부분을 구현·검증한다.

현재 코드는 **모든 체크박스 줄(`- [ ]`)을 시간지정 여부와 무관하게 task/경계로
취급**한다(`isTaskLine`, `document.ts:136`). 그 결과 아래 3가지 동작이 전부 안 된다.
이 계획은 "task = 시간지정된 체크박스만, 나머지 미지정 `- [ ]`은 앞선 timed task의
**메모 콘텐츠**"로 모델을 재정의해 셋을 동시에 해결한다.

## 목표: 신규 조건 3개

1. **스케줄/렌더에서 무시**: 시간지정 없는(`@`도 `;`도 없는) todo는 스케줄 행으로
   등장하면 안 된다.
2. **Alt+T 이동 시 함께**: timed task를 Alt+T+화살표로 재정렬하면, 그 메모 안의
   중첩 미지정 todo 박스까지 **블록 통째로** 이동해야 한다(현재는 거기서 끊김).
3. **눈금 안 멈춤**: timed task 메모의 시간눈금이 중첩 미지정 todo에서 멈추지 않고
   다음 **timed task**까지 이어져야 한다.

## 확정된 설계 결정 (유저 승인 완료)

- **무시 기준 = "체크박스면 무조건"** — 들여쓰기 무관. `@`/`;` 없는 모든 `- [ ]`은
  메모 콘텐츠. 앞에 timed task가 없는 최상위 미지정 todo는 그냥 무시(스케줄·이동·
  롤오버 대상 아님).
- **검증 = 코어 순수함수 + Jest TDD**.

## 단일 진실 (핵심 아이디어)

"task"를 **`hasTimeCondition`을 만족하는 체크박스 줄**로 재정의한다
(`timeline.ts:60-67`: `anchorMinutes` / `anchorDate` / `durationMin` / `parseError`
중 하나라도 non-null). 하나의 순수 술어로 모든 곳에서 재사용:

```
isTimedTaskLine(line, opts) = (p = parseTaskLine(line,0,opts)) !== null && hasTimeCondition(p)
```

`hasTimeCondition`이 `parseError`를 포함하므로 `- [ ] x @ 25:00`(오류)도 task로 남는다.

**미지정 줄이 흡수되는 지점 = 파싱 레이어.** `parseDocument`가 `hasTimeCondition`
실패 체크박스 줄을 건너뛰면 `today`/`below`가 timed-only가 되어 조건 #1이 자동 해결.
단, **raw 줄을 스캔하는 두 경로**(Alt+T, layout 메모 슬라이싱)는 술어를 직접 써야 함.

## 구현 순서 (각 단계 테스트 먼저 → 구현)

### Step A — 순수 술어 + 파싱 필터 (`src/core/document.ts`)
1. `hasTimeCondition`을 `timeline.ts:60-67`에서 `document.ts`로 옮겨 **export**
   (무사이클: timeline이 document를 import). `timeline.ts`는 이걸 import.
2. `isTimedTaskLine(line, opts=DEFAULT_PARSE_OPTIONS): boolean` 추가.
3. `parseDocument` push 루프(`document.ts:299-307`)에서 `if (!task) continue;` 뒤에
   `if (!hasTimeCondition(task)) continue;` 추가. 구분선 처리(`:296-298`)는 그대로.

### Step B — 순수 블록범위 추출 (`src/core/edit.ts`)
4. `nextTimedBlockStart(lines, from, regionTo, opts): number` export — `[from,
   regionTo)`에서 `isTimedTaskLine || CONT_RE`인 첫 `i`, 없으면 `regionTo`.
5. `taskBlockRange(lines, startIdx, regionTo, opts) = { start: startIdx, end:
   nextTimedBlockStart(lines, startIdx+1, regionTo, opts) }` export.
   기존 `taskBlockEnd`/`moveBlock`/`moveLine`는 **건드리지 않음**.

### Step C — 글루를 코어에 연결
6. `src/editor/moveTask.ts`: 로컬 `nextBlockStart`(`:44-53`) 삭제, 코어의
   `nextTimedBlockStart`/`taskBlockRange`로 `:88`·`range`(`:111-114`) 교체(`opts` 전달).
7. `src/core/layout.ts:58`: `isTaskLine` → `isTimedTaskLine(lines[i], opts)`.
   **조건 #2의 핵심** — 미지정 줄이 블록 시작이 아니라 앞 timed task 메모
   슬라이스에 포함돼 재레이아웃 시 함께 이동(안 바꾸면 미지정 줄 유실).
8. `src/core/timeline.ts`: 로컬 `hasTimeCondition` 제거, `./document`에서 import.
   `boundaries`(`:210-212`)는 그대로 — 행이 timed-only라 자동 정정(조건 #3).

### Step D — 롤오버 정합성 (`src/core/rollover.ts`)
9. 코드 변경 불필요. 테스트만 갱신. ⚠️ 최상위 미지정은 롤오버 안 됨(결정의 귀결).

## TDD 테스트 목록 (코드보다 먼저)

**document.test.ts**: `isTimedTaskLine`(`@ 9:00`→T, `; 30`→T, `@ 25:00`→T,
`plain`→F, `  - [ ] nested`→F, `- [x] done`→F, `mail foo@bar.com`→F); `parseDocument`
미지정 제외; 중첩 미지정 제외 + 생존 task `lineNo` 유지; 최상위 미지정 제외; `---` 인접
미지정이 구분선 안 삼킴.

**timeline.test.ts**: `:50-62` 갱신(`그냥 할 일` 부재); timed 사이 미지정 →
`boundaries.length===2`; 조건 #3 `boundaries.find(n=>n>A.lineNo)===B.lineNo`; 연속 미지정.

**edit.test.ts**(`nextTimedBlockStart`/`taskBlockRange`): 미지정 메모 흡수
(`end===2`); 연속 미지정; 마지막 task 미지정(`end===regionTo`); CONT_RE에서 멈춤;
prose+미지정 혼합; 최상위 미지정 스킵; divider 종료; done/open 미지정 둘 다 메모.

**layout.test.ts**(조건 #2): `applyLayoutString`으로 `- [ ] memo box`가 A 블록 아래
유지·`^id` 미부착·유실 없음; 재정렬-동반(멀티셋 보존).

**projection.test.ts**: 미지정 today task는 `TodayRow` 미생성.

**rollover.test.ts**(동작 포크): 기존 미지정 픽스처(`:9-21`,`:49-62`)를 timed로 교체;
timed 아래 미지정 메모는 독립 롤오버 안 됨.

## 엣지케이스 매트릭스

| 케이스 | 기대 | 잠금 |
|---|---|---|
| timed 두 개 사이 미지정 | 앞 task 흡수, 행/경계 아님 | timeline+edit |
| 연속 미지정 다수 | 모두 앞 task 흡수 | edit+layout |
| 마지막 task 미지정 메모 | 블록이 divider/region 끝까지 | edit |
| 최상위 미지정 | 무시 | document+rollover |
| 미지정+prose 혼합 | 둘 다 메모, CONT는 경계 | edit |
| done/open 미지정 | 둘 다 메모 | edit |
| `---` 인접 | 오분류/삼킴 없음 | document |
| 중첩 미지정 롤오버 | 독립 롤오버 안 됨 | rollover |
| 오류 timed(`@ 25:00`) | task 유지 | document |

## 검증 (자율)
1. `npx jest` — 전 스위트 green(갱신 + 신규 케이스 전부). 조건 #1/#2/#3 검증.
2. `npm run build` — tsc+번들 성공.
3. 그렙: `isTaskLine(`는 체크박스 감지·비경계 용도로만; 3개 경계 지점
   (`layout.ts:58`, `moveTask` range, `edit` 블록범위)은 timed 술어 사용.

## 핵심 파일
`src/core/document.ts`(술어+필터) · `src/core/edit.ts`(블록범위) ·
`src/core/layout.ts:58`(메모 동반) · `src/editor/moveTask.ts`(Alt+T) ·
`src/core/timeline.ts`(import) · `tests/core/{document,timeline,edit,layout,projection,rollover}.test.ts`.

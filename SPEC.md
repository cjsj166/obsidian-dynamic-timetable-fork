# obsidian-tasks-chute — Specification

## Purpose

Obsidian 데일리 노트 위에서 동작하는 duration 기반 일일 계획 도구.
사용자는 데일리 노트에 `- [ ]` 라인으로 태스크를 적고, 플러그인이 사이드바
뷰에서 누적 종료시각과 미래 일자 투영을 실시간으로 보여준다. 시간 추적
(start/stop) 없음. AI 런타임 통합 없음. 모바일 지원 없음.

핵심 동기는 두 가지: (1) 태스크 정리와 노트 작성을 분리하지 않기 위함,
(2) 상사에게 "언제까지 끝낼 수 있는가"를 즉답하기 위함.

## Scope

### In scope (v1)
- 데일리 노트 frontmatter 파싱 (`working_hours`, `capacity_overrides`)
- 본문 태스크 파싱 (`- [ ]` 라인 + `; H:MM` duration + `@ HH:MM` 시작시각)
- `---` divider 기반 today / below 분리
- 사이드바 뷰: today 누적 종료시각, below 일자 투영, 음수/양수 buffer 표시
- 드래그 앤 드롭 재정렬 (today 내, below 내, divider 가로지르기)
- 자정 롤오버: 어제 today의 미완료를 오늘 below로 자동 이월
- 데스크톱 전용

### Out of scope (v1)
- 시간 추적 (start/stop, 실측 로그)
- AI 런타임 호출
- 모바일 / 터치 드래그
- 반복 태스크 (recurring) 자동 생성
- Tasks 플러그인의 query 언어 (` ```tasks ` 블록)
- 외부 캘린더 동기화

---

## Data Model

### Frontmatter

```yaml
---
working_hours: 7:00              # 기본값. 생략 시 7:00.
capacity_overrides:              # 선택. working_hours 대비 상대값.
  - 2026-06-01 +1:00
  - 2026-06-03 -1:00
---
```

- `working_hours`: `H:MM` 형식. 그 날의 가용 작업시간.
- `capacity_overrides`: 리스트. 각 항목은 `YYYY-MM-DD [+|-]H:MM`. 부호 필수.
  `+`는 working_hours에 더함, `-`는 뺌. 부호 없는 값은 파싱 에러.

### Body

```
- [ ] 태스크 라인 (today)
- [ ] ...
---
- [ ] 태스크 라인 (below)
- [ ] ...
```

- 정확히 한 개의 `---` divider. 없으면 전체가 today로 해석.
- divider 위 = today 섹션, 아래 = below 섹션.
- divider 위 아래 모두 free 텍스트(메모, 빈 줄)가 태스크 라인 사이에 있을 수 있음.

### Task line syntax

```
- [STATUS] {name} {@ time}? {; duration}?
```

- `STATUS`: ` ` (미완료) 또는 `x` (완료). 그 외 상태는 v1에서 무시(미완료로 처리).
- `name`: 태스크 이름. `@`나 `;` 등장 전까지의 텍스트.
- `@ time`: 시작시각 고정.
  - today 섹션: `@ HH:MM` (오늘의 시각)
  - below 섹션: `@ YYYY-MM-DD HH:MM` (미래 일자의 시각)
- `; duration`: 항상 `; H:MM` 형식. 예: `; 0:10`, `; 1:00`, `; 7:00`.
  분 단위 정수 (`; 10`) 허용하지 않음 — 파싱 에러.
- 순서: `@` 가 `;` 보다 먼저. 둘 다 선택. 둘 중 하나만 있어도 됨.

#### 유효한 예시
```
- [ ] 출근 @ 9:00
- [ ] 메일 확인 ; 0:10
- [ ] 점심시간 @ 11:45 ; 1:00
- [ ] 할 거 1 @ 13:00 ; 2:00
- [ ] 할 거 2 ; 1:00
- [ ] 거래처 미팅 @ 2026-06-03 14:00 ; 1:00     (below 섹션에서만)
```

#### 무효한 예시 (파싱 에러)
```
- [ ] 메일 확인 ; 10                            (분 단위 정수 — 무효)
- [ ] 할 거 ; 1:00 @ 13:00                      (순서 잘못)
- [ ] 할 거 ; 1.5                               (소수점 — 무효)
- [ ] 점심 @ 11:45; 60                          (60은 H:MM 아님)
```

---

## Projection Algorithm

### Today projection

입력: today 섹션 태스크 목록, 현재 벽시계 시각 `now`.

1. `running_clock = first_task_anchor or now`
   - 첫 태스크가 `@`를 가지면 그 시각, 아니면 현재 시각.
2. 각 태스크에 대해 순서대로:
   - `start = task.@ ? max(running_clock, task.@) : running_clock`
   - `end = start + (task.duration or 0)`
   - `buffer = task.@ ? task.@ - running_clock : null`
     - `buffer > 0`: 양수 (여유). 별도 라인으로 표시.
     - `buffer < 0`: 음수 (지각). 빨강으로 강조.
     - `task.@` 없으면 buffer 없음.
   - `running_clock = end`
3. 종합 지표:
   - `today_clock_end = running_clock` (마지막 태스크의 end)
   - `today_work_total = Σ task.duration` (gap 제외, 완료/미완료 모두 포함)
   - `today_capacity = working_hours + override[today]`
   - `today_over_budget = today_work_total > today_capacity`

### Below projection

입력: below 태스크 큐, frontmatter, 시작일 (오늘 다음 날).

1. 각 future date `d`에 대해:
   - `capacity[d] = working_hours + override[d]`
2. 날짜가 박힌(`@ YYYY-MM-DD ...`) below 태스크를 먼저 해당 날짜에 할당:
   - `capacity[d] -= task.duration`
   - 만약 `capacity[d] < 0`이 되면 그 날짜는 over-booked로 마킹 (경고 표시).
3. 비-date 큐(`; duration`만 있는 below 태스크)를 순서대로 walk:
   - 현재 일자 `d`의 `remaining = capacity[d]`.
   - 태스크 duration이 `remaining` 이하면: 그 날에 다 들어감.
     - `task.end_date = d`
     - `task.end_hours_into_day = used_so_far_on_day + task.duration`
     - `capacity[d] -= task.duration`
   - 태스크 duration이 `remaining` 초과면: 일자 경계를 넘어 분할.
     - 다음 날로 넘어가며 소진. `task.end_date`는 마지막으로 소비된 날.
4. 결과: 각 below 태스크에 `end_date` + `end_hours_into_day` 부여.

### 표시 예시 (사이드바)

```
TODAY
─────────────────────────────────────────
Buffer +2:35
9:00  출근                          → 9:00
9:00  메일 확인 ; 0:10              → 9:10
11:45 점심시간 ; 1:00               → 12:45
13:00 할 거 1 ; 2:00                → 15:00
15:00 할 거 2 ; 1:00                → 16:00

Work total: 4:10 / 7:00     End: 16:00

BELOW
─────────────────────────────────────────
할 거 3 ; 7:00              → Mon Jun 2 (7:00 into day)
할 거 4 ; 8:00              → Wed Jun 4 (2:00 into day)
거래처 미팅 @ Jun 3 14:00 ; 1:00   [pinned]
할 거 5 ; 8:00              → Fri Jun 6 (1:00 into day)
```

---

## Drag-and-Drop Semantics

### Drag unit
드래그의 "한 블록" 정의:
- 시작: 잡은 `- [ ]` 라인
- 끝: 다음 `- [ ]` 라인 직전 OR `---` divider 직전 OR 파일 끝

즉, 태스크 라인과 그 뒤의 자유 텍스트(메모, 빈 줄)가 한 단위로 함께 이동.

### Reordering within today / within below
- 단순 순서 변경. 파일 내 줄 단위 cut-and-insert로 구현.
- 200ms debounce 후 파일 쓰기.

### Cross-divider drag
- today → below: today에서 빼서 below 맨 위로 삽입 (demote).
- below → today: below에서 빼서 today 맨 아래로 삽입 (promote).
- 사용자가 정확한 위치를 원하면 드롭 위치에 따라 결정.

### 충돌 방지
- 외부에서 파일 변경 감지 시: 진행 중인 드래그 취소, 재파싱, 재렌더.

---

## Day Rollover

### 트리거
- 플러그인 로드 시
- 사용자 수동 명령 "Tasks Chute: Roll over"
- (선택) 자정 타이머

### 동작
1. 현재 날짜 = `today`.
2. 어제(`today - 1`)의 데일리 노트를 찾음. 없으면 종료.
3. 어제 노트의 today 섹션에서 `- [ ]` 미완료 라인을 수집.
4. 오늘의 데일리 노트가 존재하지 않으면 Daily Notes 플러그인의 템플릿으로 생성.
5. 수집한 라인을 오늘 노트의 below 섹션 **맨 위**로 삽입.
6. 어제 노트의 원본 라인은 그대로 둠 (이력 보존).
7. 플러그인 데이터에 `last_rollover: today` 기록 → 같은 날 중복 실행 방지.

### 멱등성
- 같은 날에 두 번째 호출되면 no-op.
- `last_rollover`가 `today`보다 작을 때만 실행.

---

## File Scope and View Behavior

### 활성 노트 결정
- 사이드바 뷰는 현재 워크스페이스에서 포커스된 파일을 읽는다.
- 단, 파일명이 Daily Notes 플러그인의 날짜 패턴(예: `YYYY-MM-DD.md`)과 일치해야 함.
- 비-데일리노트가 활성화되면 뷰는 "No active daily note" 표시.

### 과거 노트 보기
- 사용자가 어제 노트를 열면 뷰는 그 노트의 투영을 표시.
- 과거 노트도 드래그 편집 가능 (단순히 마크다운 편집이므로).

### 외부 편집 동기화
- Obsidian의 vault 파일 변경 이벤트를 구독.
- 활성 노트가 외부에서 변경되면 자동 재파싱·재렌더.

---

## Edge Cases (명시 결정)

| 케이스 | 처리 |
|--------|------|
| `working_hours` 생략 | 기본값 `7:00` 사용 |
| divider 없음 | 전체를 today로 해석. below 비어있음 |
| divider 여러 개 | 첫 번째만 인식, 나머지는 무시 |
| 완료된 today 태스크 (`- [x]`) | duration은 `today_work_total`에 포함 |
| today 태스크 간 시간 갭 | 허용. gap 표시는 하되 채우지 않음 |
| today 태스크 중 `@` 음수 buffer | 빨강 강조. 시스템은 자동 조정하지 않음 |
| below 큐 태스크가 일자 경계 넘김 | 자동 분할 투영. 노트는 수정하지 않음 |
| below의 date-pinned 태스크가 일일 가용 초과 | 해당 일자 over-booked 경고, 큐는 다음 날로 |
| 태스크 라인 파싱 에러 | 그 라인은 사이드바 뷰에서 회색 + 에러 툴팁. 무시하고 다음 라인 진행 |
| frontmatter 파싱 에러 | 사이드바 상단에 에러 배너. working_hours는 기본값으로 fallback |

---

## Test Fixtures

Claude Code가 파서·투영기를 구현하면서 검증할 입력/출력 쌍.

### Fixture 1: 기본 today 투영
**입력 파일** `2026-06-01.md`:
```yaml
---
working_hours: 8:00
---
```
```
- [ ] 출근 @ 9:00
- [ ] 메일 확인 ; 0:10
- [ ] 점심시간 @ 11:45 ; 1:00
- [ ] 할 거 1 @ 13:00 ; 2:00
- [ ] 할 거 2 ; 1:00
```
**현재 시각**: 9:00.

**기대 출력**:
- 출근: start 9:00, end 9:00, buffer 0
- 메일 확인: start 9:00, end 9:10, buffer null
- 점심시간: start 11:45, end 12:45, buffer +2:35
- 할 거 1: start 13:00, end 15:00, buffer +0:15
- 할 거 2: start 15:00, end 16:00, buffer null
- `today_clock_end = 16:00`
- `today_work_total = 4:10`
- `today_capacity = 8:00`
- `today_over_budget = false`

### Fixture 2: 음수 buffer
```yaml
---
working_hours: 7:00
---
```
```
- [ ] 긴 작업 ; 4:00
- [ ] 미팅 @ 11:00 ; 1:00
```
**현재 시각**: 9:00.

**기대 출력**:
- 긴 작업: start 9:00, end 13:00
- 미팅: start 13:00, end 14:00, buffer **-2:00** (빨강)

### Fixture 3: below 투영 (단순)
```yaml
---
working_hours: 7:00
capacity_overrides:
  - 2026-06-02 +1:00
  - 2026-06-04 -1:00
---
```
```
(today 섹션 생략)
---
- [ ] 할 거 3 ; 7:00
- [ ] 할 거 4 ; 8:00
- [ ] 할 거 5 ; 8:00
```
**오늘**: 2026-06-01.

**기대 출력** (각 below 태스크):
- 할 거 3: end_date = 2026-06-02, end_hours_into_day = 7:00 (=일이 끝남)
  - day +1 capacity = 7+1 = 8h, 7h 소비.
- 할 거 4: end_date = 2026-06-03, end_hours_into_day = 7:00
  - day +1 잔여 1h + day +2 capacity 7h = 8h. day +2의 7h를 다 씀.
- 할 거 5: end_date = 2026-06-05, end_hours_into_day = 2:00
  - day +3 capacity 6h + day +4 capacity 7h = 13h. 8h 소비. day +4의 2h째에 종료.

### Fixture 4: below + date-pinned 태스크
```yaml
---
working_hours: 7:00
---
```
```
---
- [ ] 할 거 3 ; 5:00
- [ ] 거래처 미팅 @ 2026-06-03 14:00 ; 2:00
- [ ] 할 거 4 ; 6:00
```
**오늘**: 2026-06-01.

**기대 출력**:
- 거래처 미팅: 2026-06-03에 고정. 그 날 capacity = 7 - 2 = 5h가 큐 가용.
- 할 거 3: 2026-06-02 (7h 중 5h 소비).
- 할 거 4: day+1 잔여 2h + day+2(미팅 제외) 5h. 7h 가용. 6h 다 소비. end_date = 2026-06-03, end_hours_into_day = 6:00.

### Fixture 5: 자정 롤오버
**어제 노트** `2026-06-01.md`:
```
- [x] 끝난 거
- [ ] 안 끝난 거 A
- [ ] 안 끝난 거 B
---
- [ ] 미래 태스크
```
**오늘 노트** `2026-06-02.md`: 존재하지 않음.

**롤오버 실행 후 기대**:
- 오늘 노트가 생성됨 (Daily Notes 템플릿 기반).
- below 섹션 맨 위에 `- [ ] 안 끝난 거 A`, `- [ ] 안 끝난 거 B` 추가됨.
- 어제 노트는 변경되지 않음.
- 플러그인 데이터: `last_rollover = 2026-06-02`.
- 같은 날 재실행 시 no-op.

---

## Non-functional

### Performance
- 파서·투영기는 순수 함수로 작성. 사이드바 렌더는 60fps 목표 (드래그 중에도).
- 100개 태스크까지는 즉시 반응. 그 이상은 v2.

### Persistence
- 플러그인 자체 상태(예: `last_rollover`)는 `.obsidian/plugins/obsidian-tasks-chute/data.json`.
- 사용자 데이터는 항상 vault의 마크다운 파일이 진실의 원천. 플러그인 data는 메타 상태만.

### Error visibility
- 파싱 에러는 사이드바에서 명시적으로 표시. 조용히 실패하지 않음.

---

## Glossary

- **today section**: 데일리 노트의 `---` 위 영역. 오늘 실행할 태스크.
- **below section**: `---` 아래 영역. 미래 큐 + 일자 고정 미래 약속.
- **duration**: 태스크 예상 소요시간 (`; H:MM`).
- **anchor (@-time)**: 태스크 고정 시작시각.
- **buffer**: anchor가 있는 태스크의 (anchor - running_clock). 음수면 지각.
- **capacity**: 그 날의 작업 가능 시간 (working_hours + override).
- **rollover**: 자정에 어제 미완료를 오늘 below로 이월하는 동작.
- **promote / demote**: 사용자가 태스크를 today/below 사이로 드래그하는 동작.

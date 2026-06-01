# Progress

## Implementation Order

Tasks Chute v0.1.0를 향한 단계. 각 단계는 **이전 단계가 동작해야 다음으로 진행**. 순수 함수부터 빌드해 UI 변경에 코어가 흔들리지 않도록 한다.

### Milestone 1 — Fork & Bootstrap (0.5일)

- [ ] `obsidian-tasks-group/obsidian-tasks` 클론, 새 origin으로 push
- [ ] manifest.json 수정: id, name, description, isDesktopOnly=true
- [ ] `src/`에서 사용 안 할 모듈 식별 + 제거 결정 (ARCHITECTURE.md "Strip" 섹션 참조)
  - 적극적으로 잘라낼지, Tasks 플러그인 코드를 별도 폴더에 격리하고 새 코드를 옆에 둘지 결정
- [ ] `npm run dev`로 로컬 vault에서 빈 플러그인이 로드되는 것 확인
- [ ] Jest 설정 (tests/ 디렉터리 생성, 빈 테스트 통과)

### Milestone 2 — Pure parser (1일)

- [ ] `src/util/time.ts`: `H:MM` 파싱/포맷, 산술 (`addDuration`, `parseHM`, `formatHM`)
- [ ] `src/util/date.ts`: `YYYY-MM-DD` 파싱/포맷, 일자 산술
- [ ] `src/parser/task-line.ts`: 한 라인 → `Task` 객체
  - 입력: `"- [ ] 할 거 1 @ 13:00 ; 2:00"`
  - 출력: `{ status: 'open', name: '할 거 1', anchor: '13:00', duration: '2:00' }`
- [ ] `src/parser/frontmatter.ts`: working_hours, capacity_overrides
- [ ] `src/parser/document.ts`: 전체 노트 → `{ frontmatter, today[], below[] }`
- [ ] 테스트: SPEC.md의 "무효한 예시"가 모두 에러를 던지는지 확인

### Milestone 3 — Pure projection (1일)

- [ ] `src/projection/types.ts`: `TodayProjection`, `BelowProjection`, `Buffer` 타입
- [ ] `src/projection/today.ts`: SPEC.md "Today projection" 알고리즘
  - Fixture 1, 2를 테스트로 직접 작성하고 통과시킬 것
- [ ] `src/projection/below.ts`: SPEC.md "Below projection" 알고리즘
  - Fixture 3, 4를 테스트로 통과시킬 것

이 시점에서 **UI 없이도 핵심 가치가 검증된다**. 모든 알고리즘이 격리되어 있고 테스트로 회귀를 막을 수 있음.

### Milestone 4 — Read-only sidebar view (1일)

- [ ] `src/view/TasksChuteView.ts`: `ItemView` 서브클래스
- [ ] `main.ts`: view 등록, "Open Tasks Chute" 명령 등록
- [ ] `src/view/render.ts`: projection 결과 → DOM (드래그 없이 표시만)
- [ ] active file 변경 감지 → 재파싱 → 재렌더
- [ ] vault.on('modify') 구독 → 활성 파일이면 재렌더
- [ ] 비-데일리노트 활성 시 "No active daily note" 표시
- [ ] CSS 변수 사용 (다크/라이트 자동 대응)

이 시점에서 사용자가 **수동으로 마크다운을 편집해 가며** 시스템을 dogfood할 수 있다.

### Milestone 5 — Drag-and-drop (1.5일)

- [ ] HTML5 drag API로 today 내 reorder
- [ ] below 내 reorder
- [ ] today ↔ below 가로지르기
- [ ] `src/ops/drag.ts`: 드래그 종료 시 새 라인 순서 계산 + `vault.modify` 호출
- [ ] 200ms debounce
- [ ] 무한 루프 가드 (self-emitted modify 무시)
- [ ] 외부 편집 충돌 시 드래그 취소

### Milestone 6 — Day rollover (0.5일)

- [ ] `src/ops/rollover.ts`: SPEC.md "Day Rollover" 동작
- [ ] `src/ops/daily-note.ts`: Daily Notes 플러그인 API 래핑
- [ ] 플러그인 로드 시 자동 실행
- [ ] 수동 명령 "Tasks Chute: Roll over"
- [ ] `data.json`에 `last_rollover` 기록 + 멱등성 보장
- [ ] 테스트: Fixture 5

### Milestone 7 — Polish (1일)

- [ ] 파싱 에러 시각화 (라인 회색 + 툴팁)
- [ ] frontmatter 에러 배너
- [ ] over-budget 경고 (today_work_total > capacity)
- [ ] 음수 buffer 빨강 강조
- [ ] README.md 작성
- [ ] CHANGELOG.md 작성
- [ ] 로컬 vault에서 2주 dogfooding

---

## Done This Sprint

- **Phase 1 — 시간 추적·통계 제거** (2026-06-01):
  - 삭제: `StatisticsView.tsx`, `StatisticsViewComponent.tsx`
  - `TaskManager.ts`: `initializeTasks`만 남기고 write-back/dictionary/complete/interrupt/통계 계산 제거
  - `Commands.ts`: `completeTask`/`interruptTask`/`toggleStatistics` 제거
  - `main.ts`: Statistics 뷰·명령 제거, Complete/Interrupt 명령 제거, `customUrlScheme`/`pathToDictionary` 설정 제거, `initTimetableView`의 카테고리색상 대기 루프(무태스크 시 무한루프 잠재버그) 제거
  - `Button.tsx`: Complete/Interrupt 버튼 제거 (새로고침 버튼만 유지)
  - `TaskParser.ts`: `getCategoryPerformance` 제거
  - `Settings.ts`: Custom URL Scheme·Path to Dictionary 설정 + 미사용 `createTextAreaSetting` 제거
  - `npm run build` 초록 확인, vault 배포 완료. 번들 1.38MB→1.04MB (chart.js 트리셰이킹).
  - **유지(보류)**: 라이브 진행률 바·남은시간·overdue 알림 → Phase 5 뷰 재작성 시 제거 여부 결정.

- **Phase 2 — duration 파싱 (`H:MM` + 정수)** (2026-06-01):
  - `TaskParser.parseEstimate`: `; 1:30`과 `; 90` 둘 다 인식, 내부적으로 분(minutes) 문자열로 정규화 → 하위 계산 무변경.
  - `TaskParser.parseTaskName`의 estimate 제거 정규식도 H:MM 인식하도록 수정.
  - `npm run build` 초록, 배포 완료.
  - **알려진 표시 한계**: Estimate 컬럼은 정규화된 분("90")을 표시 — 입력이 `1:30`이어도 "90"으로 보임. H:MM 표시는 Phase 5 뷰 재작성에서.

- **Phase 3 — 문서 모델 (순수 파서)** (2026-06-01):
  - 신규 `src/core/` (Obsidian 비의존, 단위테스트 가능): `types.ts`, `time.ts`, `date.ts`, `document.ts`.
  - `parseDocument`: frontmatter(`working_hours` 기본 7:00, `capacity_overrides` 부호 필수) + 본문 `---` divider로 today/below 분리 + 태스크 라인 파싱(상태/이름/@anchor(시각 또는 날짜+시각)/duration/#태그, 절대 lineNo 보존).
  - Jest 셋업(ts-jest) + `tests/core/` 22 테스트 통과.
  - **미연결**: 코어는 아직 뷰에 연결 안 됨. 기존 파서로 동작 유지 → Phase 5에서 교체.

- **Phase 4 — 순수 투영 (today + below)** (2026-06-01):
  - `src/core/projection.ts`: `capacityFor`, `projectToday`(running_clock 캐스케이드 + buffer + work total/over-budget), `projectBelow`(date-pinned 예약 + 비-pinned 큐를 일자 capacity로 분배, day 경계 분할, over-booked 감지, 무한루프 가드).
  - `tests/core/projection.test.ts`: SPEC fixture 1~4 + over-booked 검증. 전체 29 테스트 통과.
  - 여전히 뷰 미연결 → Phase 5에서 연결.

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-31 | Fork base = obsidian-tasks-group/obsidian-tasks | 사용자 명시 결정. 파서 인프라 재사용 |
| 2026-05-31 | Rendering = sidebar view (not code block) | Edit/Reading mode 무관하게 상시 가용, 데일리 노트 본문은 plain markdown 유지 |
| 2026-05-31 | Daily note 단위 파일 스코프 | 주보 작성용 AI 입력 호환 + 자연스러운 자정 경계 |
| 2026-05-31 | 미완료 자동 below 이월 | over-commit 방지 — 의지 있는 것만 사용자가 promote |
| 2026-05-31 | capacity_overrides는 working_hours 대비 상대값 | working_hours 변경에 견고 |
| 2026-05-31 | today 빈 시간 허용 (음수 buffer만 경고) | 시스템이 사용자 의사 결정을 대체하지 않음 |
| 2026-05-31 | 완료된 task duration도 capacity에 포함 | 과거 일자 회계 정확성 |
| 2026-05-31 | 모바일 지원 제외 | 사용자 사용 안 함, 표면적 축소 |
| 2026-05-31 | 시간 추적 (start/stop) 제외 | 사용자 명시 요구 — 마찰 회피 |
| 2026-05-31 | duration 형식은 `H:MM` 단일 형식 강제 | 파싱 모호성 제거 |
| 2026-05-31 | capacity_overrides는 일련번호 대신 실제 날짜 사용 | 자정 마이그레이션 회피 |
| 2026-06-01 | Fork base 정정: obsidian-tasks가 아니라 **현재 Dynamic Timetable 레포 개조** | 실제 레포가 dynamic-timetable이고 이미 TaskChute 영감 파서/타임테이블 보유. 재작성 비용 회피 |
| 2026-06-01 | React 유지 (ARCHITECTURE의 "순수 DOM" 규칙 폐기) | 기존 코드 전부 React. 재작성 이득 없음 |
| 2026-06-01 | 시간 추적 전부 제거 (Complete/Interrupt, dictionary 통계, custom URL, 실제시간 write-back) | 사용자 결정. duration으로 시작/종료 투영만 필요 |
| 2026-06-01 | Statistics 뷰 완전 제거 | 실제시간 없으면 예상 vs 실제 비교 무의미 |
| 2026-06-01 | duration은 H:MM과 정수(분) 둘 다 허용 (SPEC의 "정수=에러" 완화) | 기존 노트 하위호환 |
| 2026-06-01 | manifest id/모바일 그대로 유지 (isDesktopOnly 안 바꿈) | 기존 설정 보존, 모바일 비활성화에 비용 들일 필요 없음 |
| 2026-06-01 | 노트 모델 = Daily Notes 플러그인 + YYYY-MM-DD.md 확정 | rollover/below 투영의 날짜→파일 해석 근거 |

---

## Out of Scope (v1) — 의도적 보류

다음은 v1에서 만들지 않는다. 사용 중 정말 필요해지면 v2에서 재검토.

- 반복 태스크 (recurring) 자동 생성
- 시간 추적 / actual vs estimate 로그
- Tasks 플러그인의 query 언어
- 모바일 / 터치 지원
- 외부 캘린더 동기화
- 통계 / 히트맵 / 리포트
- AI 런타임 통합 (사후 배치는 plain markdown이라 가능)
- 다중 노트 동시 편집

---

## Estimated Total

5.5 ~ 6.5일 (1인 개발 기준).
Claude Code 자동화 활용 시 절반 가능. 단, 외부 편집 동기화·드래그 엣지 케이스는 시간이 더 들 수 있음.

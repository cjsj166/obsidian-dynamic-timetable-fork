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

(아직 없음)

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

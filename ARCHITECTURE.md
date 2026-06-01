# Architecture

## Stack
- **Runtime**: Obsidian plugin (Electron). Desktop only — `isDesktopOnly: true`.
- **Language**: TypeScript 5.x.
- **Build**: esbuild (Obsidian 표준 플러그인 템플릿).
- **Tests**: Jest. 파서·투영기에 대해 unit test 의무.

## Fork Base

**Origin**: `obsidian-tasks-group/obsidian-tasks`.

이 프로젝트는 Tasks 플러그인을 포크하지만, **재사용하는 부분과 제거하는 부분이 명확히 다르다**.

### 재사용 (keep)
- 태스크 라인 파싱 인프라 (`Task` 클래스, 정규식 처리, status 처리)
- 플러그인 부트스트랩 (manifest, esbuild 설정, Obsidian API 호출 패턴)
- 파일 watcher / cache 패턴 (`Cache.ts` 등 가져갈 만한 것)

### 제거 (strip)
- ` ```tasks ` 쿼리 블록 처리 (QueryRenderer 등) — 본 프로젝트에서 사용 안 함.
- Tasks 플러그인의 이모지 메타데이터 파싱 (`📅`, `⏳`, `🔁` 등) — 본 프로젝트는 `; H:MM`, `@ HH:MM`만 인식.
- Tasks edit modal — 본 프로젝트는 사이드바 드래그가 주 인터랙션이므로 modal 불필요.
- Recurring task 처리.

### 권장 처리 방식
파일을 통째로 가져와서 위 "재사용" 모듈만 남기고 나머지를 삭제. 너무 강하게 의존성이 얽혀 있으면, **Tasks 플러그인을 참조 구현으로만 보고 새로 짜는 것**도 고려. 어느 쪽이 비용이 적은지는 첫 1~2일 작업 후 판단.

## Manifest
```json
{
  "id": "obsidian-tasks-chute",
  "name": "Tasks Chute",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Duration-based daily planning on top of daily notes. TaskChute methodology.",
  "isDesktopOnly": true
}
```

## Module Layout

```
src/
├── main.ts                  # Plugin entry. registers view, commands, file watcher.
├── view/
│   ├── TasksChuteView.ts    # ItemView. 사이드바 렌더 + 드래그 핸들러.
│   └── render.ts            # 순수 렌더 함수 (projection result → DOM).
├── parser/
│   ├── frontmatter.ts       # working_hours, capacity_overrides 파싱.
│   ├── task-line.ts         # - [ ] line → Task 객체.
│   └── document.ts          # 전체 노트 → { frontmatter, today[], below[] }.
├── projection/
│   ├── today.ts             # today 투영 알고리즘.
│   ├── below.ts             # below 투영 알고리즘.
│   └── types.ts             # ProjectionResult, Buffer, Capacity 등 타입.
├── ops/
│   ├── rollover.ts          # 자정 롤오버 동작.
│   ├── drag.ts              # 드래그 → 파일 재작성.
│   └── daily-note.ts        # Daily Notes 플러그인과의 인터페이스.
├── util/
│   ├── time.ts              # H:MM 파싱, 산술.
│   └── date.ts              # YYYY-MM-DD, 일자 산술.
└── settings.ts              # 플러그인 설정 (현재는 거의 없음).

tests/
├── parser/
├── projection/
└── fixtures/                # SPEC.md의 fixture 1~5에 대응하는 입력/기대출력.
```

## Key Data Flow

```
File change (vault.on('modify'))
        ↓
parser/document.ts        ─→  { frontmatter, today[], below[] }
        ↓
projection/today.ts       ─→  TodayProjection
projection/below.ts       ─→  BelowProjection
        ↓
view/render.ts            ─→  DOM
        ↓
TasksChuteView.containerEl
```

드래그:
```
User drags a task block in view
        ↓
ops/drag.ts: compute new line ordering
        ↓
vault.modify(file, newContent)
        ↓
file change event fires
        ↓
재파싱 / 재렌더 (위 흐름)
```

## Conventions

### Code style
- TypeScript strict. `any` 금지. `unknown` + type guard.
- 순수 함수 우선. side-effect는 `ops/`와 `main.ts`에 격리.
- 클래스보다 함수 + record 타입 선호 (Obsidian API와 닿는 곳만 클래스).
- 명명: camelCase 파일, PascalCase 타입, UPPER_SNAKE 상수.

### Architectural rules
- **파서와 투영기는 Obsidian API에 의존하지 말 것**. 그래야 노드 단위로 테스트 가능.
- View는 projection 결과만 받아 렌더. 직접 파싱 호출 금지.
- 파일 쓰기는 항상 `ops/drag.ts`나 `ops/rollover.ts`를 경유. View가 직접 vault에 쓰지 말 것.
- 200ms debounce를 모든 쓰기에 적용.

### Critical gotchas
- Obsidian의 `vault.modify`는 즉시 file change 이벤트를 트리거. 무한 루프 방지를 위해 self-emitted 변경은 무시하는 가드 필요.
- 드래그 중 외부 편집이 발생하면 드래그 취소.
- frontmatter는 Obsidian의 `metadataCache.getFileCache(file).frontmatter`로 읽되, capacity_overrides 같은 리스트는 직접 YAML 파싱이 더 안정적일 수 있음.
- Daily Notes 플러그인 API는 공식 문서가 없음. `app.internalPlugins.plugins['daily-notes'].instance.options.format` 같은 비공개 경로를 사용해야 함. 변경 가능성 있으므로 격리.

## Sidebar View Design

### Position
- Right sidebar (`WorkspaceLeaf` right).
- View type ID: `tasks-chute-view`.
- 사용자가 명령 "Open Tasks Chute"로 열 수 있어야 함.

### Layout (text-only mock)
```
┌────────────────────────────────────┐
│ Tasks Chute                    [⟳] │  ← title bar, refresh button
├────────────────────────────────────┤
│ 2026-06-01.md                      │  ← active daily note name
│ Capacity: 8:00 (default 7:00 +1:00)│
├────────────────────────────────────┤
│ TODAY                              │
│ ┌──────────────────────────────┐   │
│ │ ⋮⋮ 9:00  출근          9:00 │   │  ← draggable rows
│ │ ⋮⋮ 9:00  메일 확인     9:10 │   │
│ │ +2:35 buffer                 │   │
│ │ ⋮⋮ 11:45 점심         12:45 │   │
│ │ +0:15 buffer                 │   │
│ │ ⋮⋮ 13:00 할 거 1      15:00 │   │
│ │ ⋮⋮ 15:00 할 거 2      16:00 │   │
│ └──────────────────────────────┘   │
│ Work total: 4:10 / 8:00  End: 16:00│
├────────────────────────────────────┤
│ BELOW                              │
│ ┌──────────────────────────────┐   │
│ │ ⋮⋮ 할 거 3   → Mon 6/2 7:00h │   │
│ │ ⋮⋮ 할 거 4   → Wed 6/4 2:00h │   │
│ │ 📌 거래처 미팅 6/3 14:00     │   │  ← date-pinned
│ │ ⋮⋮ 할 거 5   → Fri 6/6 1:00h │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

### Visual rules
- Today 행: 좌측에 시작시각, 가운데 이름·duration, 우측에 누적 종료시각.
- Buffer 라인: 별도 행. 음수 buffer는 빨강 텍스트.
- Below 행: 좌측 이름, 우측 `→ Day MM/DD (Nh into day)`.
- Date-pinned below: 📌 아이콘 + 고정 일시 표시.
- 드래그 핸들: 좌측 ⋮⋮.
- 색상은 CSS 변수만 사용 (`--text-error`, `--text-success` 등). 다크/라이트 자동 대응.

## Dependencies

### Required (npm)
- `obsidian` (peer)
- TypeScript, esbuild (dev)

### Optional considered
- 드래그 라이브러리: 기본은 HTML5 drag-and-drop API로 충분. `@dnd-kit/core` 같은 라이브러리는 v1에서 도입하지 않음 (의존성 증가 회피).
- YAML 파싱: Obsidian이 이미 yaml을 가지고 있음 (`parseYaml`). 외부 패키지 불필요.

### Avoid
- React / Vue / Svelte 같은 UI 프레임워크: Obsidian 플러그인은 기본 DOM API로 충분. 프레임워크는 번들 크기만 늘림.
- 시간 추적 라이브러리: 시간 추적 기능 자체가 out of scope.

## Build & Release

```bash
npm install
npm run dev        # esbuild watch mode
npm run build      # production bundle
```

배포는 v0.1.0 도달 후 (1) 로컬 vault에 복사해 dogfooding 2주, (2) GitHub release 생성, (3) Obsidian 커뮤니티 플러그인 PR (선택).

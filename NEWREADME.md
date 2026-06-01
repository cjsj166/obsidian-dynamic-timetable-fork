# obsidian-tasks-chute — Bootstrap Package

이 디렉터리는 새 프로젝트 시작을 위한 Claude Code 부트스트랩 문서 세트다.

## Read order (for Claude Code)

1. **SPEC.md** — 무엇을 만드는가. 데이터 모델, 문법, 알고리즘, 엣지 케이스, 테스트 fixture. **단일 진실의 출처.**
2. **ARCHITECTURE.md** — 어떻게 만드는가. 포크 베이스, 모듈 구조, 컨벤션, 사이드바 디자인.
3. **PROGRESS.md** — 어떤 순서로 만드는가. Milestone 1~7, 결정 로그, scope 제외 항목.

## Working directive for Claude Code

- 위 세 파일을 진실의 출처로 삼는다. 코드와 어긋나면 **문서가 우선**.
- 새 결정이 발생하면 PROGRESS.md의 Decisions Log에 추가하고, 필요 시 SPEC.md / ARCHITECTURE.md를 함께 업데이트.
- Milestone 순서대로 진행. 각 milestone이 끝나면 PROGRESS.md의 체크박스를 갱신.
- 파서·투영기는 Obsidian API에 의존하지 않는다 (테스트 가능성 확보). 이 규칙은 절대 어기지 말 것.
- 막히는 부분이 있으면 추측으로 결정하지 말고 사용자에게 질문할 것.

## Project goals (요약)

데일리 노트에 `- [ ]` 라인으로 태스크를 적으면, 사이드바가 누적 종료시각과 미래 일자 투영을 실시간 표시.
드래그로 우선순위 변경. 자정에 미완료를 다음 날 below로 자동 이월.
시간 추적·AI·모바일은 모두 out of scope.

## Non-goals (재확인)

- 시간 추적 (start/stop, 실측 로그)
- 런타임 AI 호출
- 모바일 / 터치 드래그
- 반복 태스크 자동 생성
- Tasks 플러그인의 query 블록
- 외부 캘린더 동기화

상세는 SPEC.md "Scope" 섹션 참조.

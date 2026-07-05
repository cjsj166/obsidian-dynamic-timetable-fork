# HANDOFF — Task Time Cascade

Clone 직후 이 문서만 읽으면 재개할 수 있도록 정리한 인계 문서.
(이 `handoff/` 디렉터리는 일시적 재개 상태용 — main 병합 시 삭제 예정.)

## 이게 뭔가
Obsidian 커뮤니티 플러그인 **Task Time Cascade** (id `task-time-cascade`).
데일리 노트에 `- [ ]` 태스크를 시간(`@` 시작시각 / `;` 소요시간)과 함께 쓰면
자동으로 하루 타임라인으로 캐스케이드되고, 하나를 재정렬하면 나머지가 재배치된다.
순수 로직은 `src/core/`(obsidian 비의존), 에디터 글루는 `src/editor/`.

## 개발 환경 재개
```bash
npm ci          # 의존성 + husky 훅 자동설치 (prepare 스크립트)
npm run build   # tsc -noEmit + esbuild → main.js
npm test        # jest (순수 코어 단위테스트)
```
- 커밋 시 pre-commit 훅이 스테이징된 `*.ts`에 `prettier --write` + `eslint --fix`
  자동 적용(husky + lint-staged). 테스트/빌드는 훅에 없음 — 별도 실행.
- 줄바꿈은 LF 고정(`.gitattributes` eol=lf, prettier endOfLine=lf).

## 현재 상태
- **완료**: A-model 인에디터 헤더/눈금(Phase 9~15), 커뮤니티 제출용 리브랜딩,
  fmt/lint tooling baseline + pre-commit 훅.
- **다음 할 일(이 인계의 핵심)**: **축 B 검증** — [axis-b-plan.md](axis-b-plan.md)
  참조. 시간미지정 todo를 메모로 취급하는 모델 재정의 + TDD 3조건.
  개발서버에서 이 계획서를 브리프로 야간 자율 실행(`jest`+`build`로 자율 검증).

## 배포 트랙 (축 A) — 아직 미착수
[deployment-status.md](deployment-status.md) 참조. 하드블로커:
원격 기본브랜치 최신화(이 push로 해결), 태그·릴리스 생성, obsidianmd 린터/제출.

# Task Time Cascade

Obsidian 커뮤니티 플러그인 (id `task-time-cascade`). 데일리 노트에 `- [ ]` 태스크를
시간(`@` 시작시각 / `;` 소요시간)과 함께 쓰면 하루 타임라인으로 자동 캐스케이드되고,
하나를 재정렬하면 나머지가 재배치된다. 순수 로직은 `src/core/`(obsidian 비의존),
에디터 글루는 `src/editor/`.

## 개발 재개

```bash
npm ci          # 의존성 + husky 훅 자동설치 (prepare 스크립트)
npm run build   # tsc -noEmit + esbuild → main.js
npm test        # jest (순수 코어 단위테스트)
```

- 커밋 시 pre-commit 훅이 스테이징된 `*.ts`에 `prettier --write`+`eslint --fix` 적용
  (husky + lint-staged). 테스트/빌드는 훅에 없음 → 별도 실행.
- 줄바꿈 LF 고정(`.gitattributes` eol=lf, prettier endOfLine=lf).

## 작업 계획

개발·배포 작업의 세부 계획과 완료조건은 **`worklog/00-index.md`** 부터 읽는다.
현재 실행 범위는 `01 → 02 → 03 → 04`(04 축 B 완료 후 05·06 재논의).

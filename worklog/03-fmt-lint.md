# 03 — fmt / lint

## 목적 / 왜

코드 스타일을 통일하고(prettier), 정적 오류를 잡고(eslint), 커밋 시 자동 적용되게 해
커밋을 깔끔히 유지한다. 배포 축(A/B)과는 **별개의 코드 위생 트랙**이다.
(주의: 축 A·2b의 `eslint-plugin-obsidianmd`는 이 일반 lint와 다른 물건 —
[05](05-axis-a.md) 참고.)

## 현 상태 — ⏳ 거의 완료

- ✅ prettier: `prettier --check './src'` → 전 파일 통과
- ✅ eslint: `eslint src` → **error 0** (warning 3개는 아래)
- ✅ pre-commit 훅: `.husky/pre-commit` → `npx lint-staged`;
  `package.json`의 lint-staged가 스테이징 `*.ts`에 `prettier --write`+`eslint --fix`
- ✅ LF 고정(`.gitattributes` eol=lf, prettier endOfLine=lf)

`npm` 스크립트: `lint`, `lint:fix`, `prettier`, `prepare`(husky).

## 남은 것 — warning 3개 (열린 결정)

error가 아닌 warning이라 커밋을 막지 않음:

- `src/DailyNotes.ts:16` — `any` 타입 (단, 파일 자체가 [02](02-dead-code-cleanup.md)에서 삭제 예정)
- `src/editor/autoLayout.ts:69` — non-null assertion `!` 2곳

**결정 필요**: 완료 기준을 error 0(느슨, 이미 충족)으로 둘지, warning 0(엄격)으로 둘지.
`DailyNotes.ts` warning은 02 실행 시 자동 소멸하므로 실질 잔여는 `autoLayout.ts` 2곳.

## 완료조건

- [x] `prettier --check './src'` 통과
- [x] `eslint src` error 0
- [x] pre-commit 훅이 스테이징 `*.ts`에 자동 fmt/lint 적용
- [ ] (엄격 기준 채택 시) `eslint src` warning 0 — `autoLayout.ts` non-null assertion 2곳 해소

## 연관

- **03 ↔ 05**: 여기의 일반 eslint ≠ 05의 `eslint-plugin-obsidianmd`(제출 심사). 혼동 금지.
- **03 ↔ 02**: `DailyNotes.ts` warning은 02의 파일 삭제로 자동 해소.

원본: `handoff/HANDOFF.md`의 fmt/lint 절 + 현 repo 상태.

# 배포 상태 (축 A) — 커뮤니티 제출 추적

배포 완료조건 = **축 A**(공식 서버에서 설치 가능) + **축 B**(정상 동작 →
[axis-b-plan.md](axis-b-plan.md)). 각 조건은 3차원(유저 리뷰 / 현 상태 / 검증방법)이
정해져야 "다룰 준비 완료".

| 완료조건 | 유저 리뷰 | 현 상태 | 검증방법 |
|---|---|---|---|
| 축 A · 2a (구조적, 기계검증) | ✅ | ✅ | 미정 |
| 축 A · 2b (정책/품질/보안) | ❌ | ❌ | ❌ |
| 축 A · 인간 제출 | — | 미제출 | 대시보드(인간) |
| 축 A · 노출 | — | — | 앱 검색 / 통과 후 24h |
| 축 B (정상동작) | ✅ | 진행 예정 | Jest TDD |

## 2a 세부 (검증됨)
- ✅ 통과: id(`task-time-cascade`), semver `1.0.0`, minAppVersion `1.2.8`,
  README/manifest, fundingUrl 없음, isDesktopOnly:false, 샘플코드 0, command id
  `roll-over`, description(마침표·이모지 없음·동사 시작).
- ❌ **하드블로커 1**: 원격 기본브랜치에 옛 코드 → `git push origin master` 필요
  (이 인계 push로 해결).
- ❌ **하드블로커 2**: 릴리스·태그 없음 → `git tag 1.0.0 && git push origin 1.0.0`
  (`.github/workflows/release.yml`이 자산첨부 릴리스 생성).
- ⚠️ 소프트리스크: `LICENSE.md`(봇이 걸면 `LICENSE`로 개명), description의 em-dash.

## 2b 검증방법 후보
- 공식 린터 `eslint-plugin-obsidianmd`(가이드라인 26규칙) — `npm i -D` 후 `npx eslint src`.
- `npm audit`(의존성). preview scan(대시보드)은 인증 필요 → 인간만. policy/malware는 불투명.

## 다음 (resume 시)
1. 축 B 구현([axis-b-plan.md](axis-b-plan.md)) → `jest`+`build` green.
2. 2a 하드블로커 실행(push master + tag) → 검증.
3. 2b 착수(obsidianmd 린터 + audit).
4. 인간이 community.obsidian.md 제출 → 통과 → 24h 노출.

근거: 공식 docs(Submit your plugin / Submission requirements / Plugin guidelines),
블로그 future-of-plugins(2026-05 웹 제출+자동리뷰), obsidianmd/eslint-plugin.

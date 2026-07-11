# 05 — 축 A: 커뮤니티 서버 등재

## 목적 / 왜

배포 완료조건 = **축 A**(공식 서버에서 설치 가능) + **축 B**(정상 동작,
[04](04-axis-b.md)). 이 문서는 축 A — 커뮤니티 목록 등재 + 앱 노출을 추적한다.

각 완료조건은 **3차원**(① 유저 리뷰 ② 현 상태 ③ 실행 후 검증방법)이 모두 정해져야
"다룰 준비 완료".

## 현 상태 추적표 (✅ 완료 / ❌ 미정·미완 / ⏳ 부분 / — 해당없음)

| 완료조건 | ① 유저 리뷰 | ② 현 상태 | ③ 검증방법 | 비고 |
|---|---|---|---|---|
| **2a** (구조적, 기계검증) | ✅ | ✅ | ❌ 미정 | 하드블로커 2 + 소프트리스크 2 (아래) |
| **2b** (정책/품질/보안) | ❌ | ❌ | ❌ | 26 guideline 규칙 + policy/vuln/malware. 미착수 |
| **인간 제출** (Gate 1) | — | 미제출 | 대시보드 "리뷰중"(인간만) | community.obsidian.md 웹 제출 |
| **노출** (Gate 3) | — | — | 앱 커뮤니티 브라우저 검색 노출 / 통과 후 24h | 24h=전파, 합불은 제출 후 수 분 내 |

## 2a 세부 — 현 상태 (검증됨, 2026-06-21)

- ✅ 통과: id(`task-time-cascade`, no "obsidian", semver `1.0.0`), minAppVersion `1.2.8`,
  README/manifest 존재, fundingUrl 없음, isDesktopOnly:false, 샘플코드 0, command id
  `roll-over`(플러그인 id 미포함), description(112자·마침표·이모지없음·동사시작)
  - ⚠️ **주의**: command id `roll-over`는 [02](02-dead-code-cleanup.md)가 rollover를
    삭제하면 사라짐 → 제출 전 manifest/커맨드 상태 재검증 필요.
- ❌ **하드블로커 1**: 원격 기본브랜치 `origin/master`(=6eab3ad)에 옛 manifest
  (`dynamic-timetable` v4.6.1). 신규(`8175fac`)는 로컬 master·`tasks-chute-rework`에만,
  푸시 안 됨 → `git push origin master` 필요.
- ❌ **하드블로커 2**: GitHub 릴리스·태그 둘 다 없음 → `git tag 1.0.0 && git push origin
  1.0.0` (`.github/workflows/release.yml`이 자산첨부 릴리스 생성).
- ⚠️ 소프트리스크 1: `LICENSE.md`(문서 표기는 "LICENSE" — 봇이 걸면 개명).
- ⚠️ 소프트리스크 2: description의 em-dash `—`("특수문자 회피" 권고에 걸릴 소지).

## 2a ③ 검증방법 후보 (미결정)

- 기본브랜치 manifest: `git show origin/master:manifest.json` 또는 raw URL WebFetch.
- 태그/릴리스: `git ls-remote --tags origin`, 릴리스 자산은 download URL WebFetch
  (main.js/manifest.json/styles.css 200 확인).

## 2b — 정책/품질/보안 (미착수)

개별조건 = 26 guideline 규칙 + policy/vuln/malware.

### ③ 검증방법 후보
- 공식 린터 **`eslint-plugin-obsidianmd`**(repo obsidianmd/eslint-plugin) — `npm i -D` 후
  `npx eslint src`. manifest 구조 + 가이드라인 26규칙 과반 기계검증.
  **주의: 이 린터는 [03](03-fmt-lint.md)의 일반 prettier/eslint와 다른 물건.**
- 린터 미커버 규칙은 타깃 grep, 의존성은 `npm audit`.
- preview scan(대시보드)은 인증 필요 → AI 불가, 인간만. 정책해석·악성판정은 불투명 →
  사전 완전검증 불가.

## 완료조건

- [ ] **2a**: 원격 master 최신화(push) + 태그/릴리스 생성, 검증방법대로 확인(원격 manifest
      신규, 릴리스 자산 3종 200)
- [ ] **2b**: `eslint-plugin-obsidianmd` 통과(과반 규칙) + `npm audit` 클린, 미커버 규칙 grep 확인
- [ ] **인간 제출**: community.obsidian.md 웹 제출 → 대시보드 "리뷰중"
- [ ] **노출**: 앱 커뮤니티 브라우저에서 검색 노출(제출 통과 후 ~24h)

## 다음에 결정/실행할 것

1. 2a ③ 검증방법 확정 → 하드블로커 2개 실행(push master + tag) → 검증.
2. 2b 착수: 26규칙 개별 리뷰 → 린터+grep으로 현 상태 확인 → 검증방법 확정.
3. 인간이 community.obsidian.md 제출 → 대시보드 통과 → 24h 노출.

## 연관

- **03 ↔ 05**: 2b의 `eslint-plugin-obsidianmd` ≠ 03의 일반 lint.
- **02 → 05**: rollover 삭제가 command id/manifest에 영향 → 제출 전 재검증.
- **04/06 → 05**: 축 B·신규기능 안정 후 제출 품질 확보.

근거: 공식 docs(Submit your plugin / Submission requirements / Plugin guidelines),
블로그 future-of-plugins(2026-05 웹 제출+자동리뷰), obsidianmd/eslint-plugin.

원본: `handoff/deployment-status.md` + memory `deployment-status-tracker` (이 문서로 흡수됨).

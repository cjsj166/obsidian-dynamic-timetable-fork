# 01 — 서버로 개발 마이그레이션

## 목적 / 왜
개발 환경을 **원격 리눅스 서버로 옮긴다**. 그러면 축 B 같은 작업을 로컬을 점유하지 않고
서버에서 돌릴 수 있고, 필요할 때 에이전트를 서버에서 실행해 `jest`+`build`로 검증까지
맡길 수 있다. 축 B 계획([04](04-axis-b.md))이 성공을 전적으로 `jest`+`build`로 판정하도록
설계된 게 이걸 뒷받침한다.

> 별도의 스케줄러/오케스트레이션 시스템은 필요 없다 — 지금까지처럼 필요할 때 서버에서
> 실행하면 된다. pre-commit 훅(fmt/lint)과도 무관(그건 [03](03-fmt-lint.md) 소관).


## 현 상태 — 미착수

로컬(Windows) 개발만 존재. 재개 절차는 다음으로 검증됨:

```bash
npm ci          # 의존성 + husky 훅 자동설치 (prepare 스크립트)
npm run build   # tsc -noEmit + esbuild → main.js
npm test        # jest (순수 코어 단위테스트)
```

- 테스트/빌드는 커밋 훅에 없으므로 위 명령을 별도 실행(훅 자체는 [03](03-fmt-lint.md) 참고).
- 줄바꿈 LF 고정(`.gitattributes` eol=lf, prettier endOfLine=lf).

## 세부 계획

1. 원격 리눅스 서버 확보.
2. 서버에서 클린 클론 → `npm ci` → `npm run build` → `npm test` 재현 확인.
3. (선택) 서버에서 에이전트에게 계획서(예: [04](04-axis-b.md))를 브리프로 줘 실행시키고,
   `jest`+`build` green으로 성공/실패를 판정하게 함. 상시 자동화가 아니라 필요할 때 수동 기동.

## 완료조건

- [ ] 서버에서 `npm ci && npm run build && npm test`가 로컬과 동일하게 green
- [ ] (선택) 서버에서 에이전트가 계획서 하나를 받아 실행하고 `jest`+`build`로 결과 판정

## 연관

- **01 → 04**: 이 서버 위에서 [04 축 B](04-axis-b.md)를 실행.

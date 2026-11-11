# Code Review — Project Index

검토 범위: `server/*.mjs`, `src/**/*.ts(x)`, 설정 파일(`package.json`, `tsconfig*`, `vite.config.ts`, `start.bat`, `stop.bat`).
방법: 전체 소스 정독 + `npm run check` / `npm run typecheck` 실행 + 핵심 함수 런타임 확인.

현재 상태: `npm run check` 통과, `npm run typecheck` 통과. 자동 테스트 파일은 없음.

---

## 요약

| 심각도 | 개수 | 핵심 |
|--------|------|------|
| High | 1 | ComfyUI 자동 실행이 런타임에 항상 실패 (import 누락) |
| Medium | 5 | 과도한 재스캔, JSON 동시성, 같은 드라이브 id 충돌, `latest` 의존성, 테스트 부재 |
| Low | 6 | 죽은 import, `javascript:` 링크, 접근성, 에러 처리 누락 등 |

전반적으로 구조가 깔끔하고 보안 기본기(로컬 바인딩, Origin 검사, 토큰 제거, 원자적 파일 쓰기, body 크기 제한)가 잘 갖춰져 있다. 아래 High 1건만 실제 기능 결함이다.

---

## High

### H-1. `server/comfy.mjs` — import가 하나도 없는데 `spawn` / `path` / `existsSync`를 사용

`startComfyUi`의 기본 인자와 본문이 모듈 스코프에 없는 식별자를 참조한다. `node --check`는 문법만 보므로 통과하지만, 호출 시 즉시 `ReferenceError`가 난다.

- `server/comfy.mjs:178` — `spawnImpl = spawn`, `fileExists = existsSync` (기본값 평가)
- `server/comfy.mjs:183` — `path.join(...)`
- 파일 최상단에 `import` 구문이 전혀 없음

재현:

```text
node -e "import('./server/comfy.mjs').then(m=>m.startComfyUi({endpoint:'http://127.0.0.1:8190',enginePath:'C:\\nope'}))"
→ THREW: ReferenceError spawn is not defined
```

영향: 설정에서 `comfyEnginePath`를 지정하고 ComfyUI가 꺼져 있을 때 이미지 생성이 항상 실패한다(오류는 `refreshProject`에서 잡혀 "이미지 생성 실패" 노트로만 남음). 현재는 ComfyUI가 이미 켜져 있어 드러나지 않았을 뿐이다.

수정: 파일 상단에 추가.

```js
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
```

---

## Medium

### M-1. 새로고침 1회에 전체 스캔이 3번, Update All에서 gh 호출이 N+1번 발생

- `refreshProject`가 `findProject`를 3번 호출한다: `server/index.mjs:137`, `:157`, `:164`.
- `findProject` → `buildProjects`(`:47`)는 매번 `scanLocal`로 모든 프로젝트를 다시 스캔하고, 프로젝트마다 `git` 서브프로세스 3개(remote/tag/log)를 띄운다 (`server/scan.mjs:47-49`).
- `:137`은 `force:true`라 `listGithubRepos(force)`까지 강제되어 프로젝트마다 `gh repo list` 네트워크 호출이 발생한다.

영향: 프로젝트 25개 기준 새로고침 1회에 git 프로세스 약 225회, Update All이면 수천 회 수준. 기능은 동작하지만 체감 지연의 주 원인이다.

개선: `refreshProject`에서 처음 만든 `project`/`settings`/`overrides`를 재사용하고, 마지막에 override만 다시 읽어 최신화. Update All은 최초 `load(true)` 결과를 넘겨 재스캔을 생략.

### M-2. `projects.json` read-modify-write 경쟁

`patchOverride`(`server/store.mjs:77-89`)와 `restoreHidden`(`:91`)은 파일 전체를 읽고-고치고-쓴다. `writeJson`의 원자적 rename(`:58`)은 손상은 막지만 **갱신 유실**은 막지 못한다. 새로고침(이미지 요약 patch)과 사용자의 즐겨찾기/작업중 토글이 겹치면 한쪽이 사라질 수 있다.

개선: 프로세스 내 직렬화(간단한 promise 큐) 또는 요청 단위로 병합 후 1회 쓰기.

### M-3. 같은 드라이브에 같은 이름 폴더가 있으면 id가 충돌

`server/scan.mjs:84-88`은 중복 시 드라이브 문자만 붙인다(`project.path[0]`). 예: `C:\Claude\foo`와 `C:\Other\foo` → 둘 다 `foo-c`가 되어 React key 중복 및 override가 섞인다. 기본 roots가 드라이브별로 나뉘어 있어 평소엔 드러나지 않는다.

개선: 드라이브 문자 대신 경로 해시(예: `createHash("sha1").update(dir).digest("hex").slice(0,6)`)를 접미사로.

### M-4. 의존성 다수가 `"latest"`

`package.json:18-30`에서 `react`, `react-dom`, `lucide-react`, `vite`, `typescript`, `@types/*`, `concurrently`가 모두 `"latest"`다. `package-lock.json`이 있으면 당장은 고정되지만, lock을 갱신하는 순간 메이저 버전이 점프해 빌드가 깨질 수 있다.

개선: 실제 설치 버전으로 범위 고정(`^x.y.z`).

### M-5. 테스트 스크립트는 있지만 테스트 파일이 없음

`package.json:14`의 `test`는 `server/*.test.mjs`를 찾지만 해당 파일이 없다. `scan.mjs`의 `slug`/`cleanRemote`/`portFrom`, `llm.mjs`의 `parseJsonAnswer`, `store.mjs`의 `normalizeSettings` 등은 순수 함수라 테스트 비용이 낮다. (H-1 같은 버그도 간단한 스모크 테스트로 잡혔을 것.)

---

## Low

- **L-1. 죽은 import** — `server/index.mjs:13`의 `COMFY_AUTO_ORDER`는 import만 되고 사용처가 없다. 제거.
- **L-2. `javascript:` 링크** — `src/components/ProjectDialog.tsx:20` `Url`이 사용자가 입력한 `link`/`github`를 그대로 `href`에 넣는다. 사용자가 직접 입력하는 값이라 위험도는 낮지만, `http(s)`만 허용하도록 검증하면 안전하다. (`detail`은 `react-markdown`이라 raw HTML 비활성으로 안전.)
- **L-3. 접근성** — 모달(`ProjectDialog`)에 Esc 닫기·포커스 트랩이 없다. 카드(`ProjectCard.tsx:32`)는 `onClick`/`keydown`을 달았지만 `role="button"`이 없어 스크린리더가 버튼으로 인식하지 못한다.
- **L-4. 에러 처리 누락** — `SettingsPage.tsx:56-60`의 `restore()`는 `try/catch`가 없어 실패 시 unhandled rejection이 된다. 다른 동작은 모두 `guarded`로 감싸져 있어 일관성이 깨진다.
- **L-5. 타입 우회** — `ProjectDialog.tsx:38`의 `null as never` 캐스트가 3곳. `api.update`의 patch 타입에 `link?: string | null` 등을 명시하면 캐스트를 없앨 수 있다.
- **L-6. 릴리스 링크가 API URL일 가능성** — `server/github.mjs:15`에서 `repo.latestRelease.url`을 링크로 쓴다. `gh`의 Release `url`은 `api.github.com` 엔드포인트일 수 있어 "릴리스 보기"가 JSON을 열 수 있다(확인 필요). 브라우저용 URL이 필요하면 `tagName`으로 `https://github.com/<user>/<repo>/releases/tag/<tag>`를 조립하는 편이 안전하다.
- **L-7. 정적 파일 경로 접두사 검사** — `server/index.mjs:326`의 `startsWith(WEB_DIST)`는 `dist-evil` 같은 형제 폴더도 통과한다. URL 정규화 덕에 실제 악용은 어렵지만, `file === WEB_DIST || file.startsWith(WEB_DIST + path.sep)`로 강화하는 편이 좋다.
- **L-8. 서버 에러 핸들러 없음** — `server/index.mjs:342`에서 `listen`만 하고 `server.on("error")`(EADDRINUSE 등) 처리가 없다. `start.bat`이 포트를 정리해 주지만, 직접 `npm start` 시 원인 메시지가 불친절하다.

---

## 잘된 점 (유지 권장)

- **보안**: `127.0.0.1` 바인딩(`index.mjs:342`), 비-GET Origin 검사(`assertLocalOrigin`, `:255`), body 크기 제한(`:19,236`), git remote 토큰 제거(`scan.mjs:17`), `execFile` 기반 인자 전달(셸 인젝션 회피).
- **데이터 안전**: 설정/override JSON 원자적 쓰기(temp + rename, `store.mjs:58`).
- **LLM 호출**: 임시 디렉터리에서 CLI 실행(프로젝트 `CLAUDE.md` 오염 회피, `llm.mjs:19`), `think:false` + `format:"json"`(Ollama), `stripAnsi`, 관대한 JSON 파싱(`parseJsonAnswer`).
- **UX**: 옵티미스틱 업데이트 + 실패 롤백(`App.tsx:84-91`), Update All의 `sourceHash` 기반 LLM 스킵(`index.mjs:141-142`), 이미지 캐시 버스팅(`imageUrl` mtime).
- **문서화**: `README.md`와 코드 주석이 동작 의도(특히 예외 처리 이유)를 잘 설명한다.

---

## 우선순위 제안

1. **H-1** 즉시 수정 — 3줄 import 추가.
2. **M-1** 새로고침/Update All 재스캔 제거 (체감 속도 개선 폭이 가장 큼).
3. **M-2, M-3** 데이터 정합성.
4. **M-4, M-5** 유지보수성(버전 고정 + 최소 스모크 테스트).
5. Low 항목은 여유 있을 때 묶어서 정리.

# Project Index

이 PC(`C:\Claude`, `E:\Claude`, `G:\Claude`)와 GitHub(`madwind0526`)에 흩어진 Claude 프로젝트를 카드로 정리해서 보여주는 로컬 웹 앱입니다. 화면 스타일은 MusicAutomation과 같습니다.

## 주요 기능

- **카드**: ComfyUI로 만든 대표 이미지, 간단 요약, 태그(LLM 사용 / 설명서 / 배포판 / 카테고리)를 보여줍니다.
  - 왼쪽 위 즐겨찾기, 오른쪽 위 실행 · 새로고침 · 삭제
  - 이미지 왼쪽 아래 **작업중** 체크박스: 체크하면 파란 바탕과 테두리로 강조됩니다.
  - GitHub 공개 여부: Public은 초록, Private은 앰버(바탕색 포함)로 구분됩니다.
- **상세 팝업**: 카드를 누르면 Markdown으로 렌더링된 상세 요약, 릴리스 날짜, 링크, GitHub 주소, 로컬 경로가 보입니다. 수정 버튼으로 모든 항목을 고칠 수 있고, "AI 상세 요약" / "이미지 다시 만들기" 버튼이 있습니다.
- **왼쪽 메뉴**: Local(이 PC), GitHub(올라간 저장소), 즐겨찾기, 설정. 설정 위에 **Update All**과 **GitHub에 반영** 버튼이 있습니다.
- **상단 바**: 가운데 검색창, 오른쪽 정렬 아이콘(이름 / 최근 활동 / 릴리스 날짜 / 카테고리). 활성 아이콘을 다시 누르면 방향이 바뀝니다.
- **설정**: LLM(Claude, Codex, OpenCode, Ollama), ComfyUI(주소·모델·엔진 폴더·이미지 스타일), Local 프로젝트 폴더(여러 줄), GitHub 사용자, 카테고리 목록.

## 실행

```bash
start.bat          # 포트 정리 후 API + Vite 실행, 브라우저로 http://127.0.0.1:5189 열기
stop.bat           # 종료
npm run typecheck  # tsc -b
npm run check      # 서버 파일 node --check
```

| 용도 | 포트 |
|---|---|
| 화면 (Vite dev) | 5189 |
| 백엔드 API | 4319 |

포트는 `C:\Claude\PORTS.md`에서 배정합니다. `npm run build` 후 `npm start`를 쓰면 4319 하나에서 빌드된 화면까지 서빙합니다.

## 동작 방식

- **목록**: 요청할 때마다 설정된 폴더를 스캔하고(`package.json`, README, `start.bat`, git 정보), `gh repo list`로 GitHub 목록을 읽어(5분 캐시) 합칩니다. `gh`가 없으면 공개 저장소만 읽고 릴리스 정보는 빠집니다. 삭제된 폴더는 목록에서 자동으로 사라집니다.
- **태그**: LLM 사용(package.json·.env.example·requirements의 키워드), 설명서(README 또는 docs 폴더), 배포판(GitHub 릴리스 또는 git 태그)을 자동 판정합니다. 틀리면 팝업에서 고칩니다.
- **실행 버튼**: 해당 프로젝트의 `stop.bat nopause`를 먼저 실행하고, 새 콘솔 창에서 `start.bat`을 실행합니다. 각 프로젝트의 `start.bat`은 `C:\Claude\open-url.bat <주소>`로 서버가 뜨면 브라우저를 엽니다.
- **삭제 버튼**: 카드만 목록에서 숨깁니다. 폴더와 GitHub 저장소는 건드리지 않으며 설정에서 다시 표시할 수 있습니다.
- **새로고침**: 요약·상세·카테고리를 LLM으로 다시 만들고(직접 수정한 카드는 제외), 요약이 바뀌었거나 이미지가 없으면 이미지를 다시 만듭니다.
- **Update All**: 폴더와 GitHub를 다시 읽은 뒤 모든 카드를 새로고침합니다. README·설명이 그대로인 카드는 LLM을 건너뛰고, 요약이 바뀌었거나 이미지가 없는 카드만 이미지를 만듭니다.
- **GitHub에 반영**: 이 폴더의 변경 사항을 커밋하고 `origin`(`madwind0526/ProjectIndex`)에 푸시합니다. 저장소가 없으면 비공개로 만듭니다.
- **보안**: 서버는 127.0.0.1에만 바인딩하고, 로컬이 아닌 Origin의 변경 요청은 거부합니다. git remote 주소에 들어 있는 토큰은 화면·디스크에 남기기 전에 제거합니다.

## 구조

```
server/   index.mjs(API) scan.mjs(폴더 스캔) github.mjs(gh/REST) llm.mjs(Claude·Codex·OpenCode CLI, Ollama)
          comfy.mjs(ComfyUI, MusicAutomation의 cover-art.mjs에서 가져옴) store.mjs(설정·수정 기록)
src/      App.tsx, components/(Sidebar Topbar ProjectCard ProjectDialog), pages/(ProjectsPage SettingsPage)
data/runtime/   settings.json, projects.json, images/   (git 제외)
```

설정·수정 기록·이미지는 `data/runtime/`에 저장되며 git에는 올라가지 않습니다.

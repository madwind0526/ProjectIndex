# Patterns

> 검증된 코드 패턴. 복붙 바로 가능한 형태로 유지.

## 서버가 뜨면 브라우저를 여는 공용 스크립트 (`C:\Claude\open-url.bat`)

**사용 시점:** 모든 프로젝트의 `start.bat`이 서버와 웹 링크를 함께 띄울 때. 서버를 막는 `npm start` 앞에 한 줄 넣는다.

```bat
start "" /min C:\Claude\open-url.bat http://127.0.0.1:5189
```

스크립트는 URL의 포트에 TCP 연결이 될 때까지(최대 60초) 기다렸다가 `Start-Process`로 기본 브라우저를 연다.

## 실행 버튼: stop.bat → start.bat

**사용 시점:** 다른 프로젝트의 배치 파일을 서버에서 실행할 때. stop은 `nopause`로 끝까지 기다리고, start는 새 콘솔 창으로 분리한다.

```js
spawn("cmd.exe", ["/d", "/c", "stop.bat", "nopause"], { cwd, windowsHide: true, stdio: "ignore", timeout: 30_000 });
spawn("cmd.exe", ["/d", "/c", `start "${title}" /D "${cwd}" "${path.join(cwd, "start.bat")}"`],
  { cwd, detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
```

## 이미지는 만든 요약을 기억해 두고 비교

**사용 시점:** 요약이 바뀌면 이미지를 다시 만들어야 할 때. `makeImage`가 끝나면 `imageSummary`를 저장하고, 새로고침에서 `imageSummary !== summary`이면 다시 만든다. LLM 입력(README 등)의 해시(`sourceHash`)가 같으면 LLM 호출을 건너뛴다.

## 로컬 LLM(Ollama) JSON 응답

**사용 시점:** thinking 모델(Gemma4 등)에 JSON 답을 받을 때.

```js
body: JSON.stringify({ model, stream: false, think: false, format: "json", messages })
```

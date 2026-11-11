# Trouble Shooting

> 발생했던 버그와 해결 방법. 같은 문제를 두 번 겪지 않기 위한 기록.

## `cmd /c start.bat` 이 "'start.bat'은(는) 내부 또는 외부 명령이 아닙니다"

### 증상

`call start.bat`, `cmd /c start.bat` 모두 실패한다.

### 원인

cmd가 `start.bat`을 내장 명령 `start` + `.bat`으로 해석한다.

### 해결

`.\start.bat` 또는 전체 경로(`"E:\...\start.bat"`)로 호출한다. `start "title" /D dir "full\path\start.bat"` 처럼 인수로 넘기는 것은 문제없다. (글로벌 메모: `windows-bat-launch-from-automation.md`)

## Ollama(Gemma4)가 "LLM 응답에서 JSON을 찾지 못했습니다"

### 원인

thinking 모델이 답변 대신 추론에 토큰을 쓰고 JSON 없는 본문을 돌려준다.

### 해결

요청에 `think: false`, `format: "json"`을 함께 보낸다. Ollama가 꺼져 있으면 `fetch failed`가 나므로 `ollama serve`를 먼저 실행한다.

## 설정 파일이 빈 파일로 덮어씌워짐

### 증상

`data/runtime/settings.json`을 PowerShell 5.1 스크립트로 수정했더니 LLM 설정이 `none`으로 돌아갔다.

### 원인

`Get-Content -Raw | ConvertFrom-Json`이 UTF-8(BOM 없음) 한글을 ANSI로 읽어 파싱에 실패했고, 변수가 `$null`인 채로 `WriteAllText`가 실행되어 파일이 비었다.

### 해결

파일을 지우기 전에 파싱 성공을 확인하거나, 설정 변경은 앱의 설정 화면/API(`PUT /api/settings`)로 한다. 읽을 때는 `-Encoding UTF8`을 쓴다.

## Bash 도구 heredoc에서 백슬래시/따옴표가 깨짐

### 증상

정규식의 `\b`가 사라지거나(`\\b` → `\b` → 백스페이스), 따옴표가 섞인 heredoc이 "unexpected EOF"로 실패한다.

### 해결

코드는 Write/Edit 도구로 작성한다. 정규식 경계가 필요한 자리는 Write로 만든 스크립트에서 `String.fromCharCode(92)`로 만든다. (글로벌 메모: `bash-tool-python-heredoc-backslash.md`)

## 셸 리다이렉트로 만든 파일의 앞부분(import)이 사라짐

### 증상

`node --check`와 타입체크는 통과하는데 호출하면 `ReferenceError: spawn is not defined`가 난다 (`server/comfy.mjs`).

### 원인

`{ cat > file <<EOF ... EOF; sed ...; } > file` 처럼 안쪽 `cat >`로 쓴 헤더를 바깥 `> file`이 다시 덮어썼다.

### 해결

파일을 합칠 때는 한 번만 리다이렉트하고, 만든 뒤 `head`로 첫 줄을 확인한다. `node --check`는 문법만 보므로 `import()` 스모크 테스트(`server/comfy.test.mjs`)를 둔다.

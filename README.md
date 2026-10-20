# Betaflight CLI Editor

USB로 연결한 Betaflight 기체의 CLI 설정을 읽어, Betaflight App(구 Configurator)과 비슷한 탭 화면으로 보여 주는 Windows 앱입니다. v1의 이름은 **FC CLI Viewer**(0.1.x)였습니다.

> **2.0.0은 개발 중입니다.** 이름만 바뀌었고 아직 v1과 같은 **읽기 전용**입니다. 값 편집, CLI 파일 내보내기, 기체에 쓰기는 `v2` 브랜치에서 단계별로 추가하고 있습니다([docs/SPEC.md](docs/SPEC.md) 8~13절). 쓰기 기능이 들어가도 앱은 항상 **보기 모드로 시작**하고, 기체에 쓰려면 별도 확인 절차를 거칩니다.

- 기체 연결 → 기체 이름 입력 → `version`, `status`, `diff all`, `dump all` 자동 읽기
- 설정·포트·구성·전원·페일세이프·PID 튜닝·수신기·모드·OSD·VTX 등 18개 탭
- 기본값과 다른 값(`diff all`)은 노란 점으로 표시
- `<기체이름>.bfview.json`으로 저장하고, 나중에 기체 없이 다시 열기
- Betaflight App CLI 탭에서 저장한 `.txt` 덤프도 열 수 있음

> **FC에 아무것도 쓰지 않습니다.** 앱이 보내는 명령은 `#`, `version`, `status`, `diff all`, `dump all`, `get <이름>` 뿐이며, 그 밖의 문자열은 송신 함수에서 막힙니다(테스트로 검사). `save`·`exit`도 보내지 않으므로 읽기가 끝나면 **기체 USB를 뽑았다 다시 꽂아** 주세요.

**Betaflight 공식 프로그램이 아닙니다.** 이름에 "Betaflight"가 들어가지만 Betaflight 프로젝트와 관련이 없는 개인 도구이며, Betaflight 로고는 쓰지 않습니다.

## 설치

[Releases](../../releases) 또는 GitHub Actions 빌드 결과(Artifacts)에서 둘 중 하나를 받습니다.

| 파일 | 용도 |
| --- | --- |
| `Betaflight-CLI-Editor-Setup-<버전>.exe` | 설치판. 시작 메뉴·바탕화면 바로가기 생성, 제어판에서 제거 |
| `Betaflight-CLI-Editor-Portable-<버전>.exe` | 휴대용. 설치 없이 실행 (USB 메모리에 넣고 다니기) |

Windows 10/11 x64에서 동작하며 Node.js나 브라우저를 따로 설치할 필요가 없습니다. v1(FC CLI Viewer)과 앱 ID가 달라서 **나란히 설치**할 수 있고, 설정(마지막 저장 폴더 등)도 따로 보관됩니다.

### 처음 실행할 때 "Windows의 PC 보호" 창이 뜨면

코드 서명 인증서가 없어서 Microsoft SmartScreen이 경고를 띄웁니다.

1. 경고 창에서 **추가 정보**를 누릅니다.
2. **실행** 버튼을 누릅니다.

한 번 실행하면 같은 파일로는 다시 묻지 않습니다.

### COM 포트가 안 보이면

- 충전 전용이 아닌 **데이터용 USB 케이블**인지 확인합니다.
- Windows 10/11은 STM32 Virtual COM Port 드라이버를 기본으로 씁니다. 장치 관리자의 "포트(COM & LPT)"에 기체가 보이는지 확인합니다.
- Betaflight App 등 다른 프로그램이 포트를 열고 있으면 "다른 프로그램이 포트를 사용 중"이라고 나옵니다. 그 프로그램을 닫고 다시 시도합니다.

## 사용법

1. 기체를 USB로 연결하고 COM 포트를 고릅니다 (STM32·AT32 장치는 "FC 추정"으로 위에 나옵니다).
2. **기체 연결** → 기체 이름을 입력합니다 (FC에 저장된 `craft_name`이 기본값).
3. **읽기 시작** → 약 10~30초 뒤 설정 탭이 열립니다.
4. 상단 바의 **저장**으로 `.bfview.json` 저장. 파일 이름은 기체 이름이 기본이고 저장 창에서 바꿀 수 있습니다. 상단 바의 기체 이름을 눌러 이름을 바꿀 수도 있습니다.
5. **원문 내보내기**는 `diff all` 원문을 `<기체이름>_diff.txt`로 저장합니다 (Betaflight CLI에 그대로 붙여넣을 수 있는 형식).
6. 저장 파일은 첫 화면의 **저장 파일 열기** 또는 창에 끌어다 놓기로 엽니다.

## 개발

```bash
npm install
```

```bash
npm run dev
```

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 실행 (Electron 창) |
| `npm test` | 파서·시리얼 화이트리스트·탭 화면 테스트 (Vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run dist` | Windows exe 빌드 → `release/` |
| `npm run icon` | `build/icon.ico` 다시 만들기 |
| `npm run fixtures:sample` | 합성 샘플 덤프 다시 만들기 |

- 구조와 규칙은 [CLAUDE.md](CLAUDE.md), 전체 요구사항은 [docs/SPEC.md](docs/SPEC.md)에 있습니다.
- 실제 기체의 `diff all` / `dump all`을 `fixtures/<이름>.dump.txt`, `fixtures/<이름>.diff.txt`로 넣으면 테스트가 자동으로 검사합니다 ([fixtures/README.md](fixtures/README.md)).
- exe 빌드는 Windows에서 합니다. `main` 브랜치에 push하면 GitHub Actions(`windows-latest`)가 빌드해 Artifacts에 올리고, `v*` 태그를 push하면 Release 초안에 exe를 붙입니다.
- npm 11은 패키지 설치 스크립트를 기본으로 막습니다. `package.json`의 `allowScripts`에서 Electron만 허용했고, serialport는 미리 빌드된 바이너리(N-API)를 써서 C++ 빌드 도구가 필요 없습니다.

## 라이선스

MIT. Betaflight App(GPL)의 코드는 복사하지 않았고, 탭 구성과 라벨만 참고했습니다.

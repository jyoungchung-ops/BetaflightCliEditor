# Betaflight CLI Editor

USB로 연결한 Betaflight 기체의 CLI 설정을 읽어 Betaflight App(구 Configurator)과 비슷한 탭 화면으로 보여 주고, 화면에서 고친 값을 **변경분만** 기체에 쓰는 Windows 앱입니다. v1의 이름은 **FC CLI Viewer**(0.1.x, 읽기 전용)였습니다.

**Betaflight 공식 프로그램이 아닙니다.** 이름에 "Betaflight"가 들어가지만 Betaflight 프로젝트와 관련이 없는 개인 도구이며, Betaflight 로고는 쓰지 않습니다.

- 기체 연결 → 기체 이름 입력 → `version`, `status`, `diff all`, `dump all`, `get` 자동 읽기
- 설정·포트·구성·전원·페일세이프·PID 튜닝·수신기·모드·OSD·VTX 등 18개 탭, 기본값과 다른 값은 노란 점
- **편집 모드**: 숫자·목록·켜짐/꺼짐 입력, 모드 범위·OSD 요소 끌기, 범위 밖 값은 빨간 테두리, 되돌리기(Ctrl+Z / Ctrl+Y)
- **내보내기**: 변경분 CLI 파일(Betaflight App CLI 탭에 붙여 넣기용), 편집을 반영한 전체 diff
- **기체에 쓰기**: 안전 확인 → 다시 읽어 같은 기체인지 확인 → 자동 백업 → 변경분만 전송 → save → 다시 읽어 재검증
- `<기체이름>.bfview.json`으로 저장(편집 중인 값 포함), 나중에 기체 없이 다시 열어 이어서 편집

## 기체에 쓰기 — 꼭 읽어 주세요

> 잘못된 설정은 모터 폭주·추락으로 이어질 수 있습니다. **쓰기는 프로펠러와 배터리를 분리하고 USB로만 연결한 상태에서** 하세요.

- 앱은 언제나 **보기 모드로 시작**합니다. 보기·편집 모드에서는 기체에 아무것도 보내지 않습니다(읽기 명령 `#`, `version`, `status`, `diff all`, `dump all`, `get` 만).
- 쓰기는 상단 바 **[편집] → [기체에 쓰기]** 로만 합니다. 매번 아래 절차를 거칩니다.
  1. "프로펠러를 분리했습니다", "배터리를 분리했습니다" 확인
  2. 기체를 다시 읽어 **펌웨어(버전·타깃·빌드)와 보드가 편집 원본과 같은지** 확인 — 다르면 쓰지 않습니다
  3. 원본을 읽은 뒤 기체에서 바뀐 값이 있으면 목록을 보여 주고 "내 편집으로 덮기 / 취소"를 묻습니다
  4. 쓰기 직전 설정을 저장 폴더의 `backups\<기체이름>_<날짜시각>_before-write.txt` / `.bfview.json` 으로 **자동 백업**
  5. 변경 목록(탭·항목·원래 값·새 값)과 보낼 명령 원문을 보여 주고, **기체 이름을 직접 입력**해야 [쓰기]가 켜집니다. 모터·보드 방향·수신기·시동 스위치·페일세이프·필터 값에는 경고가 붙습니다
  6. `batch start` → 변경 명령 → `save`. 한 줄이라도 오류가 나면 **save 없이 멈춥니다** — 기체를 다시 꽂으면 원래 설정으로 돌아갑니다
  7. 다시 읽어 편집한 값은 새 값과, 편집하지 않은 값은 백업과 같은지 대조합니다
- 펌웨어가 저장하면서 다른 설정에 맞춰 값을 고치는 경우가 있습니다(예: 노치 주파수가 컷오프보다 낮으면 끔). 그러면 결과 화면에 "다시 읽은 값이 다릅니다" 목록이 나옵니다.
- **[이 내용으로 기체 맞추기]**(편집 모드): 저장해 둔 파일을 열고(편집 포함) 기체를 연결하면, 기체를 읽어 **파일과 다른 값만** 같은 절차로 씁니다. 파일을 저장한 뒤 Betaflight App에서 바꾼 값도 파일대로 돌아갑니다. 펌웨어 빌드·보드가 파일과 같아야 하고, LED·VTX 테이블·서보·resource/timer/dma·조정 범위 등은 비교하지 않습니다.
- 결과 화면의 **[백업으로 되돌리기]** 는 쓰기 직전과 다른 값만 같은 절차로 되돌립니다. `defaults`(초기화)는 쓰지 않습니다.
- 4.5.4 이상은 `save noreboot` 으로 저장한 뒤 같은 연결에서 재검증합니다. 끝나면 **USB를 뽑았다 다시 꽂아** 재부팅하세요. 4.5.3은 save 때 재부팅하므로 앱이 다시 연결합니다(최대 15초).
- 쓰기를 지원하는 펌웨어: **4.5.x, 2025.12.x, 2026.6.x** (SITL로 실측한 계열). 그 밖은 쓰기를 막습니다.
- 앱이 보내지 않는 명령: `defaults`, `bl`, `dfu`, `flash_erase`, `resource`, `timer`, `dma`, `msc`, `serialpassthrough`, `motor`, `play_sound`, `vtx_info`, `exit` 등. 앱이 만들 수 있는 형식(`set`, `feature`, `aux`, `serial`, `map`, `rxfail`, `profile`, `rateprofile`, `battery_profile`, `batch start`, `save`)이 아니면 송신 함수에서 막힙니다(테스트로 검사).
- LED, VTX 테이블, 서보, resource/timer/dma 는 보기만 하고 편집할 수 없습니다.
- 모든 쓰기의 송수신 원문은 저장 폴더의 `logs\write_<날짜>.log` 에 남습니다. 문제가 생기면 이 파일과 백업을 보관해 주세요.
- **실제 기체 첫 테스트 권장 순서**: `craft_name` 하나만 바꿔 쓰기 → Betaflight App에서 확인 → [백업으로 되돌리기] → 레이트 값 하나로 반복 → 모터·보드 방향·수신기 관련 값은 마지막에.

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
3. **읽기 시작** → 약 10~30초 뒤 설정 탭이 열립니다. 읽기만 한 뒤에는 기체가 CLI 모드에 남으므로 **USB를 뽑았다 다시 꽂아** 주세요.
4. 상단 바의 **저장**으로 `.bfview.json` 저장 (편집 중인 값도 함께). 상단 바의 기체 이름을 눌러 이름을 바꿀 수 있습니다.
5. **[편집]** 을 켜면 값을 고칠 수 있습니다. 바뀐 값은 파란 테두리, 사이드바에 탭별 변경 개수가 나옵니다. 필드의 ↺ 버튼이나 **모두 되돌리기**로 원래 값으로.
6. **내보내기** 메뉴: 변경분 CLI(`<이름>_changes_<날짜>.txt`), 편집 반영 전체 diff(`<이름>_diff-edited_<날짜>.txt`), 원문 diff all. 범위를 벗어난 값이 있으면 내보내기·쓰기가 막힙니다.
7. 편집 범위 정보(`get`)가 없는 v1 저장 파일은 편집할 수 없습니다 — 기체를 한 번 연결해 다시 읽어 주세요.

## 개발

```bash
npm install
```

```bash
npm run dev
```

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 실행 (Electron 창). 개발 실행에서만 SITL(`tcp://127.0.0.1:5761`) 포트가 보입니다 |
| `npm test` | 파서·화이트리스트·편집·명령 생성·쓰기 세션·탭 화면 테스트 (Vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run dist` | Windows exe 빌드 → `release/` |
| `npm run icon` | `build/icon.ico` 다시 만들기 |

- 구조와 규칙은 [CLAUDE.md](CLAUDE.md), 전체 요구사항은 [docs/SPEC.md](docs/SPEC.md), 펌웨어별 CLI 동작 실측은 [docs/cli-compat.md](docs/cli-compat.md)에 있습니다.
- SITL 통합 테스트(WSL2 Ubuntu에 Betaflight SITL 빌드 필요): `scripts/sitl/run-all.ps1`(읽기), `run-paste.ps1`(변경분 붙여 넣기), `run-write.ps1`(쓰기 절차 전체 + 오류 주입). 평소 `npm test` 에서는 건너뜁니다.
- `v*` 태그를 push하면 GitHub Actions(`windows-latest`)가 빌드해 Release 초안에 exe를 붙입니다.
- npm 11은 패키지 설치 스크립트를 기본으로 막습니다. `package.json`의 `allowScripts`에서 Electron만 허용했고, serialport는 미리 빌드된 바이너리(N-API)를 써서 C++ 빌드 도구가 필요 없습니다.

## 라이선스

MIT. Betaflight App(GPL)의 코드는 복사하지 않았고, 탭 구성과 라벨만 참고했습니다.

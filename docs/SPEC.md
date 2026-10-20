# Betaflight CLI 뷰어/에디터 — Claude Code 작업 지시서

2026-10-20 · 클로에

- 1~7절: v1 Betaflight CLI Viewer (완료, GitHub 배포됨)
- 8~13절: v2 Betaflight CLI Editor (편집·쓰기 기능 추가, 이번 작업)

---

# v1: Betaflight CLI Viewer

## 1. 개요와 목표

USB로 연결한 Betaflight 기체의 CLI 값을 읽어, Betaflight App(구 Configurator)과 같은 탭 구조로 보여주는 **읽기 전용 뷰어**를 만든다. 최종 산출물은 Windows 실행 파일(.exe)이다. 이 문서는 Claude Code에 그대로 전달하는 작업 지시서이며, 프로젝트 루트에 `CLAUDE.md` 또는 `docs/SPEC.md`로 두고 단계별로 진행한다.

**핵심 기능**

- Betaflight App의 탭 구성을 본뜬 사이드바 + 탭 화면
- 기체 USB 연결 → 기체 이름 입력 → CLI 덤프 자동 읽기
- 탭을 따라 들어가면 해당 탭의 설정값이 App과 비슷한 레이아웃으로 표시
- 저장 시 기본 파일명 = 입력한 기체 이름, 사용자가 변경 가능
- 저장한 파일을 다시 열어 기체 없이 열람

**절대 원칙: FC에 아무것도 쓰지 않는다.** `save`, `set`, `defaults`, `bl`, `dfu`, `flash_erase` 등 쓰기·재부팅·초기화 명령은 코드에서 보낼 수 없게 막는다(3절의 명령 화이트리스트).

**테스트 대상 기체**: Meteor75 Pro(O4, CRSF), Pavo20 Pro2(O4), GEPRC Moz7(O4 Pro, ELRS). 세 기체 모두 DJI O4 계열이라 OSD는 HD(MSP DisplayPort) 캔버스를 기본으로 지원해야 한다.

**범위 밖**: 값 편집·쓰기, 실시간 센서/모터 테스트, 펌웨어 플래싱, 프리셋, Betaflight 로고·상표 사용.

## 2. 기술 스택과 실행 환경

최종 산출물은 Windows 10/11용 실행 파일(.exe)이다. UI는 React로 만들고 Electron으로 감싸 exe로 패키징하며, 시리얼 포트는 Node `serialport` 라이브러리로 직접 연다.

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 앱 셸 | Electron | 브라우저 없이 단독 실행되는 Windows exe |
| 언어/빌드 | TypeScript + electron-vite | 메인·프리로드·렌더러 일괄 빌드 |
| UI | React + CSS 변수(다크 테마) | 탭/패널 컴포넌트화 |
| 시리얼 | `serialport` (메인 프로세스) | COM 포트 목록·VID 필터, 권한 팝업 없음 |
| IPC | `contextBridge` 프리로드 | 렌더러는 화이트리스트 명령만 요청 가능 |
| 저장/열기 | `dialog.showSaveDialog({ defaultPath })`, `showOpenDialog` | Windows 기본 저장창, 파일명 변경 가능 |
| 테스트 | Vitest | 파서 단위 테스트 |
| 패키징 | electron-builder → NSIS 설치판 + 포터블 exe | 설치형/USB 휴대형 둘 다 제공 |

- 개발·테스트는 맥에서 `npm run dev`로 해도 된다. 단 exe 빌드는 Windows PC 또는 GitHub Actions `windows-latest` 러너에서 한다(맥 크로스 빌드는 Wine 필요, 네이티브 모듈 문제가 잦음).
- `serialport`는 네이티브 모듈이므로 `@electron/rebuild`로 Electron 버전에 맞춰 빌드한다.
- Windows 10/11은 STM32 VCP를 기본 드라이버로 인식한다. COM 포트가 안 보이면 드라이버 점검 안내 문구를 띄운다.
- 코드 서명이 없으므로 첫 실행 시 SmartScreen 경고(추가 정보 → 실행)가 뜬다. README에 안내한다.
- 참고 소스: [betaflight-configurator 저장소](https://github.com/betaflight/betaflight-configurator)의 `src/tabs/*.html`, `src/js/tabs/*.js`로 각 탭의 레이아웃·라벨·디코딩 로직을 확인한다. 코드를 복사하지 말고 구조만 참고한다(GPL 라이선스).

## 3. FC 연결과 CLI 읽기 절차

연결 후 CLI 모드에 들어가 읽기 명령 4개만 순서대로 보내고, 응답 원문을 그대로 보관한 뒤 파싱한다.

1. **포트 선택**: 메인 프로세스에서 `SerialPort.list()`로 COM 포트 목록을 받아 드롭다운에 표시한다. STM32 VCP(vendorId `0483`), AT32(`2E3C`)는 "FC 추정"으로 위에 정렬하되 전체 목록도 허용. [새로고침] 버튼과 USB 연결/분리 시 자동 갱신(2초 폴링). 보드레이트 115200.
2. **CLI 진입**: `#`을 보내고 `Entering CLI Mode` 문구와 프롬프트 `# `가 올 때까지 대기(타임아웃 3초).
3. **명령 순차 실행** — 각 명령은 `\n`으로 끝내고, 응답 끝의 프롬프트 `\r\n# `를 감지하면 다음 명령으로 넘어간다:
    1. `version` — 펌웨어 버전, 타깃, 보드명
    2. `status` — CPU, 센서, 활성 프로필 등
    3. `diff all` — 기본값과 다른 값(변경 표시용)
    4. `dump all` — 모든 프로필 포함 전체 값(화면 표시용, 수천 줄이라 최대 20초 대기)
4. **진행 표시**: 명령별 진행 상태와 수신 줄 수를 IPC로 렌더러에 보내 표시한다.
5. **종료**: `save`나 `exit`는 보내지 않고 포트만 닫는다. FC는 CLI 모드에 머물러 있으므로 완료 화면에 "기체 USB를 뽑았다 다시 꽂으세요"를 안내한다.

**명령 화이트리스트** (이 외 문자열은 송신 함수에서 예외 처리): `#`, `version`, `status`, `diff all`, `dump all`, `get <이름>`. 송신 함수는 하나만 두고 그 안에서 검사한다.

**예외 처리**

- 포트 사용 중(Access denied — Betaflight App 등이 COM 포트를 열고 있음) → "다른 프로그램이 포트를 사용 중" 안내
- 응답 중 USB 분리 → 받은 데까지 버리고 재연결 안내
- CLI 진입 실패(MSP만 응답 등) → 재시도 1회 후 오류 표시
- 수신 버퍼는 줄 단위로 누적하고 `\r` 제거

## 4. CLI 파싱 데이터 모델

파서는 `dump all` 텍스트를 줄 단위로 읽어 아래 모델을 만들고, `diff all`에 나온 키는 `changed` 집합에 넣어 화면에서 강조한다. 모르는 줄은 버리지 않고 `unknown`에 보관한다.

| CLI 줄 형식 | 저장 위치 | 비고 |
| --- | --- | --- |
| `# Betaflight / <타깃> ... <버전>` | `meta.firmware` | 헤더 주석 |
| `board_name X`, `manufacturer_id X` | `meta.board` | |
| `set key = value` (프로필 밖) | `master[key]` | 전역 설정 |
| `profile N` 이후 `set` | `pidProfiles[N][key]` | PID·필터 프로필 |
| `rateprofile N` 이후 `set` | `rateProfiles[N][key]` | 레이트 프로필 |
| `feature X` / `feature -X` | `features` | 켜짐/꺼짐 |
| `serial <id> <mask> <msp> <gps> <telem> <bb>` | `serial[]` | 기능 비트마스크 해석 |
| `aux <i> <modeId> <ch> <start> <end> <logic> <link>` | `aux[]` | 모드 범위(µs) |
| `adjrange ...` | `adjustments[]` | |
| `map AETR1234` | `rxMap` | |
| `rxfail ...`, `rxrange ...` | `rxFail[]`, `rxRange[]` | |
| `resource`, `timer`, `dma` | `resources[]` | 표시만 |
| `vtxtable ...` | `vtxTable` | |
| `led`, `color`, `mode_color` | `led` | |
| `mixer`, `mmix`, `smix`, `servo` | `mixer` | |
| `beeper`, `beacon` | `beeper` | |
| `batch`, `defaults nosave`, `save` 등 | 무시 | |

```ts
interface CraftSnapshot {
  craftName: string;            // 사용자가 입력한 기체 이름
  readAt: string;               // ISO 시각
  raw: { version: string; status: string; diffAll: string; dumpAll: string };
  meta: { firmware: string; target: string; board: string; activePidProfile: number; activeRateProfile: number };
  master: Record<string, string>;
  pidProfiles: Record<string, string>[];
  rateProfiles: Record<string, string>[];
  features: Record<string, boolean>;
  serial: SerialPortCfg[]; aux: AuxRange[]; adjustments: AdjRange[];
  rxMap?: string; vtxTable?: VtxTable; led?: LedCfg; mixer?: MixerCfg;
  changed: string[];            // "master.motor_pwm_protocol", "pid.0.p_roll" 형식
  unknown: string[];
}
```

- 값은 문자열 그대로 저장하고 표시 시점에 해석한다(펌웨어 버전별 키·열거값 차이 대응).
- 키 이름은 펌웨어마다 바뀐다(예: 4.5 → 2025.12). 탭 매핑은 키 목록 테이블(`src/mapping/*.ts`)로 분리하고, 매핑에 없는 `set` 키는 자동으로 "기타" 탭에 나오게 한다.
- 파서 테스트용으로 세 기체의 `diff all`/`dump all` 텍스트를 `fixtures/`에 넣는다(Betaflight App CLI 탭에서 저장한 파일 사용).

## 5. Betaflight 탭 구성과 값 매핑

왼쪽 사이드바에 Betaflight App과 같은 순서로 탭을 두고, 각 탭은 App의 박스(패널) 배치를 따라 값을 읽기 전용 필드·토글·표로 그린다. 변경된 값(`changed`)은 노란 점으로 표시한다. 아래 키 이름은 4.5 기준 예시이며, Claude Code는 픽스처의 실제 키로 확인해 맞춘다.

| 탭 | 주요 CLI 소스 | 화면 구성 |
| --- | --- | --- |
| 설정(Setup) | `version`, `status`, `board_name`, `craft_name`, `pilot_name`, `acc_trim_*` | 기체 정보 카드: 이름, 펌웨어, 타깃, 센서, 활성 프로필 |
| 포트(Ports) | `serial` 줄 | UART별 행 × MSP / Serial RX / 텔레메트리 / 센서 / 주변기기 열, 보드레이트 표시. ID 0~9=UART1~10, 20=USB VCP, 30+=소프트시리얼(펌웨어 `serial.h`로 확인) |
| 구성(Configuration) | `mixer`, `motor_pwm_protocol`, `motor_pwm_rate`, `dshot_bidir`, `motor_poles`, `pid_process_denom`, `align_board_*`, `gyro_*_sensor_align`, `features`, `small_angle`, `yaw_motors_reversed` | 시스템·ESC·보드 정렬·기능 토글 패널 |
| 전원·배터리 | `vbat_*_cell_voltage`, `vbat_scale`, `ibata_scale`, `ibata_offset`, `battery_meter`, `current_meter`, `bat_capacity` | 배터리/전류계 패널 |
| 페일세이프 | `failsafe_*`, `rxfail`, `rx_min_usec`, `rx_max_usec` | 단계 1·2 설정, 채널별 폴백 값 |
| PID 튜닝 | `pidProfiles[]`, `rateProfiles[]`, `simplified_*`, `gyro_lpf*`, `dterm_lpf*`, `dyn_notch_*`, `rpm_filter_*` | 하위 탭 3개(PID 설정 / 레이트 / 필터). PID 프로필·레이트 프로필 드롭다운, P·I·D·D Max·FF 표, 슬라이더 값, 레이트 표 + 레이트 곡선 그래프 |
| 수신기(Receiver) | `serialrx_provider`, `rx_spi_protocol`, `map`, `rssi_channel`, `rc_smoothing_*` | 프로토콜, 채널 맵, 스무딩 패널(실시간 막대는 없음) |
| 모드(Modes) | `aux` 줄 | 모드별 행: AUX 채널 + 900~2100µs 범위 막대(App과 동일). modeId→모드명 표는 configurator 소스에서 가져옴 |
| 조정(Adjustments) | `adjrange` | 범위 막대 + 조정 기능명 |
| 서보 | `servo`, `smix` | 고정익일 때만 탭 표시 |
| 모터 | `motor_pwm_protocol`, `motor_idle`(구 `dshot_idle_value`), `yaw_motors_reversed`, `mixer` | 믹서 그림 + 설정값(모터 테스트 슬라이더 없음) |
| OSD | `osd_*_pos`, `osd_displayport_device`, `vcd_video_system`, `displayport_msp_*` | 요소 목록 + 미리보기 격자. HD 53×20(O4), PAL 30×16, NTSC 30×13. 위치 값 디코딩은 configurator `osd.js` 참고 |
| 영상송신기(VTX) | `vtx_band`, `vtx_channel`, `vtx_power`, `vtx_freq`, `vtxtable` | 밴드/채널/출력 표. O4 기체는 비어 있을 수 있음 |
| LED 스트립 | `led`, `color`, `mode_color` | LED 격자 + 색상 |
| 블랙박스 | `blackbox_device`, `blackbox_sample_rate`, `blackbox_mode`, `debug_mode` | 로깅 설정 패널 |
| GPS | `gps_provider`, `gps_sbas_mode`, `gps_rescue_*` | GPS 기능 꺼져 있으면 비활성 표시 |
| CLI | `raw.*` | `diff all` / `dump all` 원문 전환, 검색, 복사 |
| 기타 | 매핑에 없는 `set` 키, `unknown` | 키·값 표 + 검색 |

- 실시간 데이터가 필요한 App 탭(센서, 프리셋)은 넣지 않는다.
- 상단 바에는 기체 이름, 펌웨어 버전, 읽은 시각, 저장 버튼을 둔다.
- 디자인은 Betaflight App의 다크 테마·노란 강조색 분위기를 따르되 로고와 이름은 쓰지 않는다.

## 6. 기체 이름 입력과 저장 흐름

연결 직후 기체 이름을 받고, 그 이름이 화면 제목과 기본 저장 파일명이 된다.

1. 첫 화면: COM 포트 드롭다운, [기체 연결] 버튼, [저장 파일 열기] 버튼.
2. 연결 성공 → **기체 이름 입력 모달**. 입력란 기본값은 FC의 `craft_name`(비어 있으면 빈칸). 빈 값이면 [읽기 시작] 버튼 비활성.
3. CLI 읽기(3절) → 파싱(4절) → 설정 탭으로 이동.
4. 상단 바의 기체 이름은 클릭해 수정 가능. 수정하면 기본 파일명도 따라 바뀐다.
5. **[저장]**: `dialog.showSaveDialog({ defaultPath: <마지막 저장 폴더>\<기체이름>.bfview.json })`로 Windows 저장창을 연다. 사용자는 창에서 파일명과 위치를 바꿀 수 있다. 마지막 저장 폴더는 앱 설정(`app.getPath('userData')`)에 기억하고, 처음엔 `문서\FPV 기체` 폴더를 제안한다.
6. **[원문 내보내기]**: `diff all` 원문을 `<기체이름>_diff.txt`로 저장(Betaflight CLI에 붙여넣기 가능한 형식).

**파일명 규칙**

- 기본: `<기체이름>.bfview.json` (예: `Meteor75 Pro.bfview.json`)
- Windows 금지 문자(`/ \ : * ? " < > |`)는 `_`로 바꾸고, 앞뒤 공백과 끝의 마침표 제거, 최대 100자. 예약어(`CON`, `PRN`, `AUX`, `NUL`, `COM1`~`COM9`, `LPT1`~`LPT9`)와 같으면 뒤에 `_`를 붙인다.
- 같은 이름 파일이 있으면 Windows 저장창의 덮어쓰기 확인에 맡긴다.
- 선택: electron-builder `fileAssociations`로 `.bfview.json` 더블클릭 시 이 앱으로 열리게 한다.

**저장 파일 내용**: 4절의 `CraftSnapshot` 전체 + `schemaVersion: 1`, `appVersion`. 원문(`raw`)이 들어 있으므로, 파서가 개선되면 열 때 원문에서 다시 파싱한다.

**열기**: [저장 파일 열기] 또는 창에 파일 드래그 → 연결 없이 같은 탭 화면으로 표시. 상단 바에 "오프라인 파일 · 읽은 시각"을 표시한다. Betaflight App에서 저장한 `.txt` CLI 덤프를 열어도 파싱되게 한다(이 경우 기체 이름 모달을 띄움).

## 7. 작업 단계와 완료 기준

Claude Code는 아래 단계를 순서대로 진행하고, 각 단계가 끝날 때마다 실행 결과를 보여준 뒤 다음 단계로 넘어간다.

1. **뼈대**: electron-vite + React + TS 프로젝트, 메인/프리로드/렌더러 구조, 사이드바 + 빈 탭 화면 전체(5절 순서), 상단 바, 다크 테마.
2. **파서**: `src/shared/cli/parser.ts` + Vitest. `fixtures/`의 세 기체 덤프로 테스트.
3. **시리얼 리더**: `src/main/serial/cliReader.ts` — 3절 절차, 화이트리스트, 진행 표시 IPC, 예외 처리.
4. **탭 화면**: 설정 → 포트 → 구성 → 수신기 → 모드 → PID 튜닝 → 전원·배터리 → 페일세이프 → OSD → VTX → 나머지 순으로 채운다.
5. **이름·저장·열기**: 6절 흐름 전체.
6. **패키징**: electron-builder 설정(`win.target`: `nsis`, `portable`, x64), 앱 아이콘(`.ico`), GitHub Actions `windows-latest` 빌드 워크플로, README(설치·SmartScreen 안내).

**완료 기준**

- [ ] Windows 10/11에서 설치판 `Setup.exe`와 포터블 `exe` 모두 실행됨(Node·브라우저 별도 설치 불필요)
- [ ] 실제 기체 연결 → 이름 입력 → 30초 안에 전 탭 표시
- [ ] FC로 화이트리스트 외 문자열을 보내는 코드 경로가 없음(테스트로 확인)
- [ ] Betaflight App에서 같은 기체를 열었을 때 PID·레이트·포트·모드 값이 일치
- [ ] `diff all`에 있는 값이 모두 변경 강조됨
- [ ] 저장 기본 파일명 = 기체 이름, Windows 저장창에서 변경 가능
- [ ] 저장 파일을 다시 열면 연결 없이 같은 화면
- [ ] 매핑에 없는 키가 "기타" 탭에 빠짐없이 표시
- [ ] 파서 테스트 통과(세 기체 픽스처)

**사용자가 미리 준비할 것**: 세 기체 각각 Betaflight App CLI 탭에서 `diff all`과 `dump all` 결과를 텍스트로 저장해 `fixtures/`에 넣기.

---

# v2: Betaflight CLI Editor (편집·쓰기 기능 추가)

## 8. v2 목표와 원칙

v1의 보기 화면을 그대로 쓰면서, 값을 고쳐 CLI 파일로 내보내고 필요할 때 기체에 쓰는 기능을 더한다. v1 코드(1~7절)는 완성되어 GitHub에 올라가 있으므로, 이 절부터는 기존 저장소 위에 이어서 작업한다.

**이름과 버전**: 프로그램 이름을 **Betaflight CLI Editor**로 바꾸고 버전은 2.0.0으로 올린다. 창 제목, `package.json`의 `productName`, 설치 파일명(`Betaflight-CLI-Editor-Setup-2.0.0.exe`, `Betaflight-CLI-Editor-Portable-2.0.0.exe`), 앱 아이콘 툴팁, README를 모두 바꾼다. 앱 ID(`appId`)는 v1과 다르게 정해 v1과 나란히 설치되게 한다. 저장소는 GitHub에서 이름을 바꾸면(Settings → Rename) 옛 주소가 자동으로 새 주소로 연결되므로, 블로그의 v1 링크도 계속 동작한다.

**세 가지 모드**

| 모드 | 하는 일 | 기체에 쓰기 |
| --- | --- | --- |
| 보기 | v1 그대로. 기본 모드 | 불가 |
| 편집 | 탭에서 값을 수정, CLI 파일로 내보내기. 기체 없이 가능 | 불가 |
| 쓰기 | 편집한 변경분을 연결된 기체에 전송 후 `save` | 가능 |

**원칙**

- 앱은 항상 보기 모드로 시작한다. 편집은 상단 바의 [편집] 토글로 켜고, 쓰기는 편집 모드에서 [기체에 쓰기]를 눌러 별도 확인 절차를 거친다.
- v1의 송신 함수 화이트리스트는 그대로 둔다. 쓰기용 송신은 **별도 함수**(`writeSession`)로 만들고, 쓰기 절차(11절) 안에서만 호출할 수 있게 한다.
- 기체에는 **바뀐 값만** 보낸다. 전체 dump를 덮어쓰지 않는다.
- 쓰기 전 자동 백업, 쓰기 후 다시 읽어 대조하는 과정은 생략할 수 없다.
- 범위 밖: MSP를 이용한 쓰기(Betaflight App 방식), 펌웨어 플래싱, 다른 펌웨어 버전 간 설정 이전(변환).

## 9. 편집 모드

편집 모드를 켜면 각 탭의 읽기 전용 필드가 입력 가능한 컨트롤로 바뀌고, 원본과 달라진 값은 파란 테두리로 표시한다.

**데이터 구조**

```ts
interface EditSession {
  base: CraftSnapshot;      // 읽어온 원본 (수정 금지)
  edits: Map<string, Edit>; // 키: "master.motor_pwm_protocol", "pid.0.p_roll", "aux.3", "serial.UART2"
  undoStack: Edit[];        // Ctrl+Z / Ctrl+Y
}
interface Edit { key: string; before: string; after: string; scope: 'master'|'pid'|'rate'|'line'; }
```

- 원본(`base`)은 절대 수정하지 않고, 화면은 `base + edits`를 합쳐 그린다.
- 값을 원래대로 되돌리면 `edits`에서 자동 제거.
- 사이드바 각 탭 옆에 변경 개수 배지, 상단 바에 "변경 12개 · [모두 되돌리기]".
- 필드마다 마우스를 올리면 "원래 값 → 새 값"과 개별 되돌리기 버튼.

**입력 컨트롤 규칙**

| 값 종류 | 컨트롤 | 예 |
| --- | --- | --- |
| 숫자 범위 | 숫자 입력 + 범위 밖 빨간 테두리 | `p_roll`, `vbat_max_cell_voltage` |
| 열거값 | 드롭다운 | `motor_pwm_protocol`, `serialrx_provider` |
| ON/OFF | 토글 | `feature`, `dshot_bidir` |
| 모드 범위 | 900~2100µs 범위 막대 드래그 + AUX 채널 드롭다운 | `aux` |
| 포트 기능 | 포트 탭 표의 체크박스·드롭다운 | `serial` |
| OSD 위치 | 미리보기 격자에서 요소 드래그, 표시 체크 | `osd_*_pos` |
| 문자열 | 텍스트 입력(길이 제한) | `craft_name`, `pilot_name` |

**값 범위와 허용값 얻기**

- 기체에서 읽을 때 `get` (인수 없이)을 화이트리스트에 추가해 함께 읽는다. 이 출력에는 각 변수의 `Allowed range` / `Allowed values`가 들어 있다. Claude Code는 실제 기체나 SITL 출력으로 형식을 확인해 파서를 만든다.
- 파싱 결과는 `CraftSnapshot.schema`(키별 타입·범위·허용값)로 저장하고, 저장 파일에도 포함해 기체 없이 편집할 때 쓴다.
- `schema`가 없는 v1 파일을 열면 "기체를 한 번 연결해 범위 정보를 읽어야 편집할 수 있습니다"를 안내하고 편집을 막는다.
- 범위를 벗어난 값이 하나라도 있으면 내보내기와 쓰기 버튼을 비활성화한다.

**편집 저장**: 편집 중인 상태는 저장 파일(`.bfview.json`)에 `edits`로 같이 넣어, 다음에 열어도 이어서 편집할 수 있게 한다. `schemaVersion`은 2로 올리고 v1 파일도 읽을 수 있게 한다.

## 10. CLI 명령 생성 규칙

`edits`를 CLI 명령 목록으로 바꾸는 함수 `buildCommands(session): string[]`를 만들고, 내보내기와 기체 쓰기가 같은 함수를 쓴다. 파서의 역방향이므로, 생성한 명령을 다시 파서에 넣으면 같은 값이 나와야 한다(왕복 테스트).

| 변경 종류 | 생성 명령 | 주의 |
| --- | --- | --- |
| 전역 변수 | `set key = value` | 문자열은 파서가 읽은 형식 그대로 |
| PID 프로필 변수 | `profile N` 후 `set ...` | 프로필별로 묶어서 출력 |
| 레이트 프로필 변수 | `rateprofile N` 후 `set ...` | 상동 |
| 기능 | `feature X` / `feature -X` | |
| 모드 범위 | `aux <i> <modeId> <ch> <start> <end> <logic> <link>` | 줄 전체를 새로 생성. 삭제는 시작·끝을 900 900으로 |
| 조정 범위 | `adjrange ...` | 줄 전체 |
| 포트 | `serial ...` | 펌웨어별 형식이 다름(2025.12부터 포트 이름 사용). 파서가 읽은 형식을 그대로 따름 |
| 채널 맵 | `map AETR1234` | |
| 페일세이프 채널 | `rxfail <ch> <mode> <value>` | |
| LED, VTX 테이블, 서보 | (v2에서는 편집 불가) | 보기만 유지 |
| `resource`, `timer`, `dma` | **편집 금지** | 잘못 쓰면 보드가 동작하지 않을 수 있음 |

**내보낸 파일 형식** (`<기체이름>_changes_<날짜>.txt`)

```
# Betaflight CLI Editor 2.0.0
# craft: Meteor75 Pro
# firmware: <헤더의 펌웨어 문자열 그대로>
# based on: 원본을 읽은 시각
# changes: 3

batch start

set motor_pwm_protocol = DSHOT300

profile 0
set p_roll = 48

aux 0 0 0 1700 2100 0 0

batch end

save
```

- Betaflight App의 CLI 탭에 그대로 붙여 넣어도 동작하는 형식으로 만든다. `batch start` / `batch end`는 펌웨어의 `diff all` 출력과 같은 방식인지 픽스처로 확인하고, 다르면 펌웨어 출력을 따른다.
- 편집 전체가 적용된 `diff all` 형식의 백업 파일도 따로 내보낼 수 있게 한다([전체 diff로 내보내기]).

## 11. 기체에 쓰기 절차

쓰기는 아래 순서를 한 단계도 건너뛰지 않고, 어느 단계에서든 실패하면 `save` 없이 연결을 끊는다. `save` 전에 끊기면 기체는 재부팅 후 원래 설정으로 돌아간다.

1. **안전 확인 창**: "프로펠러를 분리했습니다", "배터리를 분리했습니다" 두 체크박스를 모두 체크해야 [다음]이 활성화된다.
2. **연결과 현재 설정 읽기**: v1 절차(3절)로 `version`, `diff all`, `dump all`, `get`을 읽는다.
3. **일치 검사** — 하나라도 틀리면 중단:
    1. 펌웨어 헤더(버전·타깃·빌드)가 편집 원본과 같은가
    2. `board_name`이 같은가 (다른 기체에 잘못 쓰는 것 방지)
    3. 편집 대상 키들의 **현재 값이 편집 원본(`before`)과 같은가**. 다르면 원본을 읽은 뒤 기체 설정이 바뀐 것이므로 충돌 목록을 보여주고 사용자에게 "내 편집으로 덮기 / 취소" 선택을 받는다.
4. **자동 백업**: 2단계에서 읽은 값을 `<저장폴더>\backups\<기체이름>_<YYYYMMDD-HHmmss>_before-write.txt`(diff all 원문)와 `.bfview.json`으로 저장. 저장 실패 시 중단.
5. **미리보기와 최종 확인**: 변경 목록을 표(탭 / 항목 / 원래 값 / 새 값)와 실제 전송될 명령 원문으로 보여주고, 확인란에 기체 이름을 직접 입력해야 [쓰기]가 활성화된다.
6. **전송**: 명령을 한 줄씩 보내고 프롬프트를 기다린다. 각 응답에 `###ERROR`, `Invalid`, `Unknown` 등 오류 문구가 있는지 검사(정확한 문구는 펌웨어 소스·SITL로 확인). 오류가 하나라도 나오면 즉시 중단하고 `save` 없이 연결 종료.
7. **save**: 모든 명령이 성공했을 때만 `save`를 보낸다. FC가 재부팅하며 포트가 사라지므로 재연결을 기다린다(최대 15초, COM 포트 번호가 바뀔 수 있으므로 VID/PID와 시리얼 번호로 다시 찾기).
8. **재검증**: 다시 읽어서 편집한 모든 값이 `after`와 같은지, 편집하지 않은 값은 백업과 같은지 대조한다.
9. **결과 화면**: 성공이면 새 설정을 편집 원본으로 삼고 `edits`를 비운다. 불일치가 있으면 목록과 함께 [백업으로 되돌리기] 버튼을 보여준다.

**백업으로 되돌리기**: 백업 파일과 현재 기체 값의 차이만 명령으로 만들어 같은 절차(1~9)로 쓴다. `defaults` 명령을 쓰는 전체 복원은 하지 않는다.

**CLI 진입 방식**: v1 검증(4.5.4 이상 펌웨어의 framed MSP-CLI 여부) 결과를 그대로 따른다. 검증이 끝나지 않은 펌웨어 버전에서는 쓰기를 막고 "이 펌웨어는 아직 쓰기를 지원하지 않습니다"를 안내한다.

## 12. 안전장치와 예외 처리

비행에 직접 영향을 주는 값은 쓰기 전에 한 번 더 경고하고, 보드를 망가뜨릴 수 있는 명령은 아예 만들지 않는다.

**절대 보내지 않는 명령** (`writeSession` 안에서 차단, 테스트로 확인): `defaults`, `bl`, `dfu`, `flash_erase`, `resource`, `timer`, `dma`, `msc`, `serialpassthrough`, `motor`(모터 구동), `play_sound`, `vtx_info` 등 하드웨어를 직접 구동하거나 제어하는 명령. 허용 명령은 10절 표의 생성 명령 + `profile`, `rateprofile`, `batch`, `save` 뿐이다.

**추가 경고가 필요한 값** — 미리보기에서 노란 경고 아이콘과 설명을 붙인다:

| 분류 | 예 | 경고 문구 |
| --- | --- | --- |
| 모터·ESC | `motor_pwm_protocol`, `dshot_bidir`, `motor_poles`, `yaw_motors_reversed`, `mixer` | 모터 방향·동작이 바뀔 수 있음. 프롭 없이 모터 탭에서 확인 |
| 보드 방향 | `align_board_*`, `gyro_*_sensor_align` | 자세 인식이 틀리면 이륙 즉시 추락 |
| 수신기·포트 | `serialrx_provider`, `serial`, `map` | 조종기가 인식되지 않거나 O4 항전기 연결이 끊길 수 있음 |
| 모드 | `aux`의 ARM·FAILSAFE·BEEPER | 시동 스위치가 바뀜 |
| 페일세이프 | `failsafe_*`, `rxfail` | 신호 상실 시 동작이 바뀜 |
| 필터 | `gyro_lpf*`, `dterm_lpf*`, `dyn_notch_*`, `rpm_filter_*` | 모터 과열 위험. 첫 비행은 짧게 하고 모터 온도 확인 |

**예외 처리**

- 전송 중 USB 분리: save 전이므로 기체는 원래 설정. "쓰기가 적용되지 않았습니다" 안내.
- `save` 직후 분리 또는 재연결 실패: 적용 여부를 알 수 없으므로 "다시 연결해 재검증하세요"와 [재검증] 버튼. 백업 파일 위치도 표시.
- 명령 응답 타임아웃(줄당 2초): 오류와 같게 취급해 중단.
- 모든 쓰기 세션은 송수신 원문을 `<저장폴더>\logs\write_<날짜>.log`로 남긴다(문제 발생 시 Claude Code에 넘길 자료).

## 13. v2 작업 단계와 완료 기준

v1 저장소에서 `v2` 브랜치를 만들어 아래 순서로 진행하고, 각 단계가 끝날 때마다 결과를 보여준 뒤 다음으로 넘어간다. 0단계 결론이 나오기 전에는 5단계(쓰기)를 시작하지 않는다.

0. **선행 검증**: v1에서 남은 펌웨어별 CLI 진입 방식 검증(SITL)을 끝내고, 같은 SITL에서 `get` 출력 형식과 명령 오류 문구를 확인해 `docs/cli-compat.md`에 추가.
1. **이름 변경**: Betaflight CLI Editor 2.0.0으로 바꾸기(8절). 앱 동작은 그대로.
2. **스키마**: `get` 파서, `CraftSnapshot.schema`, 저장 파일 `schemaVersion: 2`와 v1 파일 호환.
3. **편집 모드**: `EditSession`, 탭별 입력 컨트롤(9절 표), 변경 표시, 되돌리기. 탭 순서는 v1과 같이 설정 → 포트 → 구성 → 수신기 → 모드 → PID 튜닝 → 나머지.
4. **명령 생성과 내보내기**: `buildCommands` + 왕복 테스트(생성 → 파싱 → 같은 값), 변경분 파일과 전체 diff 내보내기.
5. **SITL에 쓰기**: 실제 기체 전에 SITL에서 11절 절차 전체를 돌리고, 오류 주입 테스트(잘못된 값, 전송 중 연결 끊기, 펌웨어 불일치, 충돌)를 포함한다.
6. **안전장치**: 12절의 차단 목록과 경고, 백업·되돌리기, 쓰기 로그.
7. **패키징과 배포**: 설치판·포터블 2.0.0 빌드, README에 쓰기 기능 주의사항 추가, GitHub Release 초안(릴리스 노트 포함) 작성. 저장소 이름 변경은 내가 직접 한다.

**완료 기준**

- [ ] 앱은 보기 모드로 시작하고, 보기·편집 모드에서는 FC로 쓰기 명령이 나갈 수 없음(테스트로 확인)
- [ ] 기체 없이 저장 파일을 열어 편집하고 변경분 CLI 파일을 내보낼 수 있음
- [ ] 내보낸 파일을 Betaflight App CLI 탭에 붙여 넣으면 오류 없이 적용됨
- [ ] 범위를 벗어난 값이 있으면 내보내기·쓰기가 막힘
- [ ] 펌웨어·보드가 다르면 쓰기가 막힘, 충돌이 있으면 사용자에게 물어봄
- [ ] 쓰기 전 백업 파일이 남고, 쓰기 후 재검증에서 모든 값이 일치
- [ ] 전송 중 연결을 끊으면 기체 설정이 바뀌지 않음(SITL과 실제 기체에서 확인)
- [ ] 백업으로 되돌리기가 동작
- [ ] 12절의 차단 명령이 어떤 경로로도 전송되지 않음(테스트로 확인)

**실제 기체 첫 테스트 (내가 할 일)**: 프롭과 배터리를 분리한 상태에서, 비행에 영향이 없는 `craft_name` 하나만 바꿔 쓰고 → Betaflight App에서 확인 → 백업으로 되돌리기까지 해 본 다음, 레이트 값 하나로 한 번 더 반복한다. 모터·보드 방향·수신기 관련 값은 마지막에 테스트한다.

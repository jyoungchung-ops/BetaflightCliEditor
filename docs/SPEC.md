# Betaflight CLI 뷰어 — Claude Code 작업 지시서

Oct 19, 2026 · @클로에

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

1. **포트 선택**: 메인 프로세스에서 `SerialPort.list()`로 COM 포트 목록을 받아 드롭다운에 표시한다. STM32 VCP(vendorId `0483`), AT32(`2E3C`)는 "FC 추정"으로 위에 정렬하되 전체 목록도 허용. \[새로고침\] 버튼과 USB 연결/분리 시 자동 갱신(2초 폴링). 보드레이트 115200.
2. **CLI 진입**: `#`을 보내고 `Entering CLI Mode` 문구와 프롬프트 ` #  `가 올 때까지 대기(타임아웃 3초).
3. **명령 순차 실행** — 각 명령은 `\n`으로 끝내고, 응답 끝의 프롬프트 ` \r\n#  `를 감지하면 다음 명령으로 넘어간다:
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
| `board_name X`, `manufacturer_id X` | `meta.board` |  |
| `set key = value` (프로필 밖) | `master[key]` | 전역 설정 |
| `profile N` 이후 `set` | `pidProfiles[N][key]` | PID·필터 프로필 |
| `rateprofile N` 이후 `set` | `rateProfiles[N][key]` | 레이트 프로필 |
| `feature X` / `feature -X` | `features` | 켜짐/꺼짐 |
| `serial <id> <mask> <msp> <gps> <telem> <bb>` | `serial[]` | 기능 비트마스크 해석 |
| `aux <i> <modeId> <ch> <start> <end> <logic> <link>` | `aux[]` | 모드 범위(µs) |
| `adjrange ...` | `adjustments[]` |  |
| `map AETR1234` | `rxMap` |  |
| `rxfail ...`, `rxrange ...` | `rxFail[]`, `rxRange[]` |  |
| `resource`, `timer`, `dma` | `resources[]` | 표시만 |
| `vtxtable ...` | `vtxTable` |  |
| `led`, `color`, `mode_color` | `led` |  |
| `mixer`, `mmix`, `smix`, `servo` | `mixer` |  |
| `beeper`, `beacon` | `beeper` |  |
| `batch`, `defaults nosave`, `save` 등 | 무시 |  |

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
| 포트(Ports) | `serial` 줄 | UART별 행 × MSP / Serial RX / 텔레메트리 / 센서 / 주변기기 열, 보드레이트 표시. ID 0\~9=UART1\~10, 20=USB VCP, 30+=소프트시리얼(펌웨어 `serial.h`로 확인) |
| 구성(Configuration) | `mixer`, `motor_pwm_protocol`, `motor_pwm_rate`, `dshot_bidir`, `motor_poles`, `pid_process_denom`, `align_board_*`, `gyro_*_sensor_align`, `features`, `small_angle`, `yaw_motors_reversed` | 시스템·ESC·보드 정렬·기능 토글 패널 |
| 전원·배터리 | `vbat_*_cell_voltage`, `vbat_scale`, `ibata_scale`, `ibata_offset`, `battery_meter`, `current_meter`, `bat_capacity` | 배터리/전류계 패널 |
| 페일세이프 | `failsafe_*`, `rxfail`, `rx_min_usec`, `rx_max_usec` | 단계 1·2 설정, 채널별 폴백 값 |
| PID 튜닝 | `pidProfiles[]`, `rateProfiles[]`, `simplified_*`, `gyro_lpf*`, `dterm_lpf*`, `dyn_notch_*`, `rpm_filter_*` | 하위 탭 3개(PID 설정 / 레이트 / 필터). PID 프로필·레이트 프로필 드롭다운, P·I·D·D Max·FF 표, 슬라이더 값, 레이트 표 + 레이트 곡선 그래프 |
| 수신기(Receiver) | `serialrx_provider`, `rx_spi_protocol`, `map`, `rssi_channel`, `rc_smoothing_*` | 프로토콜, 채널 맵, 스무딩 패널(실시간 막대는 없음) |
| 모드(Modes) | `aux` 줄 | 모드별 행: AUX 채널 + 900\~2100µs 범위 막대(App과 동일). modeId→모드명 표는 configurator 소스에서 가져옴 |
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

1. 첫 화면: COM 포트 드롭다운, \[기체 연결\] 버튼, \[저장 파일 열기\] 버튼.
2. 연결 성공 → **기체 이름 입력 모달**. 입력란 기본값은 FC의 `craft_name`(비어 있으면 빈칸). 빈 값이면 \[읽기 시작\] 버튼 비활성.
3. CLI 읽기(3절) → 파싱(4절) → 설정 탭으로 이동.
4. 상단 바의 기체 이름은 클릭해 수정 가능. 수정하면 기본 파일명도 따라 바뀐다.
5. **\[저장\]**: `dialog.showSaveDialog({ defaultPath: <마지막 저장 폴더>\<기체이름>.bfview.json })`로 Windows 저장창을 연다. 사용자는 창에서 파일명과 위치를 바꿀 수 있다. 마지막 저장 폴더는 앱 설정(`app.getPath('userData')`)에 기억하고, 처음엔 `문서\FPV 기체` 폴더를 제안한다.
6. **\[원문 내보내기\]**: `diff all` 원문을 `<기체이름>_diff.txt`로 저장(Betaflight CLI에 붙여넣기 가능한 형식).

**파일명 규칙**

- 기본: `<기체이름>.bfview.json` (예: `Meteor75 Pro.bfview.json`)
- Windows 금지 문자(`/ \ : * ? " < > |`)는 `_`로 바꾸고, 앞뒤 공백과 끝의 마침표 제거, 최대 100자. 예약어(`CON`, `PRN`, `AUX`, `NUL`, `COM1`~~`COM9`, `LPT1`~~`LPT9`)와 같으면 뒤에 `_`를 붙인다.
- 같은 이름 파일이 있으면 Windows 저장창의 덮어쓰기 확인에 맡긴다.
- 선택: electron-builder `fileAssociations`로 `.bfview.json` 더블클릭 시 이 앱으로 열리게 한다.

**저장 파일 내용**: 4절의 `CraftSnapshot` 전체 + `schemaVersion: 1`, `appVersion`. 원문(`raw`)이 들어 있으므로, 파서가 개선되면 열 때 원문에서 다시 파싱한다.

**열기**: \[저장 파일 열기\] 또는 창에 파일 드래그 → 연결 없이 같은 탭 화면으로 표시. 상단 바에 "오프라인 파일 · 읽은 시각"을 표시한다. Betaflight App에서 저장한 `.txt` CLI 덤프를 열어도 파싱되게 한다(이 경우 기체 이름 모달을 띄움).

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

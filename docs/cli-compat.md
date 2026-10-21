# Betaflight 버전별 CLI 진입 방식 (소스 조사)

조사일 2026-10-19. 하드웨어 없이 펌웨어·Configurator 소스만 읽은 결과입니다. SITL·실기체 확인은 [hw-test-checklist.md](hw-test-checklist.md)와 2단계에서 합니다.

## 결론

**공식 문서가 맞습니다.** 조사한 모든 태그(4.5.3 ~ 2026.6.2)에서 `'#'` 한 바이트를 보내면 지금처럼 대화형 CLI(배너 + `"\r\n# "` 프롬프트)에 들어갑니다.

drone-check README의 "4.5.4+ / 2025.x는 `#`로 진입이 안 된다"는 말은 소스와 맞지 않습니다.

- 4.5.4에서 **추가된** 것은 `0x02`(STX)로 들어가는 **두 번째 방식(비대화형)** 입니다. `'#'` 방식이 없어진 것이 아닙니다.
- 이 방식은 MSP 프레임이 아닙니다. 그냥 CLI 텍스트를 STX/ETX로 감싼 것입니다.
- Configurator도 CLI 탭에서는 여전히 `'#'`을 보냅니다. STX/ETX는 백업·프리셋 탭에서만 씁니다.
- drone-check는 `"#\r"`를 보냅니다. 4.5.3~4.5.5에서는 `'\r'`이 다른 수신 묶음으로 도착하면 대기 중인 CLI 진입이 취소되므로(아래 ③), 실패를 이 때문에 겪었을 가능성이 큽니다. 우리 리더는 `'#'` 한 바이트만 보내고 기다리므로 이 문제가 없습니다.

## 버전 × 진입 방식

| 펌웨어 | `'#'` 대화형 CLI | `0x02` STX/ETX 비대화형 CLI | 배너 | `'#'` 뒤에 바로 다른 바이트(`'\r'` 등)가 오면 | MSP DisplayPort UART에서 `'#'` | MSP로 CLI 설정 읽기/쓰기 |
| --- | --- | --- | --- | --- | --- | --- |
| 4.5.3 | ✅ | ❌ 없음 | `Entering CLI Mode, type 'exit' to return, or 'help'` | ⚠️ 다음 스케줄러 주기에 도착하면 진입 취소 | 처리함 | 없음 |
| 4.5.4 | ✅ | ✅ 추가됨 | `... type 'exit' to reboot, or 'help'` | ⚠️ 다른 수신 묶음이면 진입 취소 | 처리함 | 없음 |
| 4.5.5 | ✅ | ✅ | 4.5.4와 같음 | ⚠️ 4.5.4와 같음 | 처리함 | 없음 |
| 2025.12.5 | ✅ | ✅ | 4.5.4와 같음 | ✅ `'$'`(MSP 시작)일 때만 취소 | **무시** (USB VCP는 해당 없음) | 없음 |
| 2026.6.0-rc3 | ✅ | ✅ | 4.5.4와 같음 | ✅ 2025.12와 같음 | **무시** | `MSP2_CLI_SETTING` `0x3010` / `_INFO` `0x3011` 추가 |
| 2026.6.2 | ✅ | ✅ | 4.5.4와 같음 | ✅ | **무시** | 2026.6.0-rc3과 같음 |

모든 버전에 공통인 동작은 셋입니다.

- 프롬프트는 `"\r\n# "`입니다(`cliPrompt`).
- `'#'` 뒤로 **100 ms 동안 아무 바이트도 오지 않아야** CLI에 들어갑니다.
- `MINIMAL_CLI`로 빌드된 펌웨어는 배너가 `"\r\nCLI"` 한 줄뿐입니다.

## 두 방식의 차이

| | `'#'` 대화형 | `0x02` STX/ETX 비대화형 (4.5.4+) |
| --- | --- | --- |
| 보내는 것 | `#` → 배너·프롬프트 → `명령\n` → 응답 + 프롬프트 | `STX 명령 LF ETX` 를 한 묶음으로 (명령마다 한 세션) |
| FC 응답 | 에코 + 응답 + `"\r\n# "` | `STX` + 응답(에코·프롬프트 없음) + `ETX` |
| 끝내기 | `exit`(4.5.4+는 **재부팅**) 또는 USB 분리. 우리는 아무것도 보내지 않고 포트만 닫음 | 호스트의 `ETX` 또는 진입 후 2초가 지나 도착한 바이트 → FC가 `ETX` 보내고 **재부팅 없이** 종료 |
| 아밍 금지(`ARMING_DISABLED_CLI`) | 걸림 → 읽은 뒤 **USB를 다시 꽂아야 함** | 안 걸림 → 다시 꽂을 필요 없음 |
| 모르는 명령 | `###ERROR ... UNKNOWN COMMAND` | `ERR_CMD_NA: <명령>` |

## 근거 (파일:줄, 태그 기준)

펌웨어 저장소: github.com/betaflight/betaflight

### ① `'#'` → 대화형 진입
| 태그 | `'#'` 수신 → 대기 | 100 ms 보호 시간 | `cliEnter` 호출 | 배너 | 프롬프트 |
| --- | --- | --- | --- | --- | --- |
| 4.5.3 | msp_serial.c:453–454 | msp_serial.c:461 | msp_serial.c:479 `cliEnter(port)` | cli.c:6784 | cli.c:954 |
| 4.5.4 | msp_serial.c:547–548 | msp_serial.c:441–442 | msp_serial.c:461 `cliEnter(port, true)` | cli.c:6838 | cli.c:963 |
| 4.5.5 | msp_serial.c:545–546 | msp_serial.c:441–442 | msp_serial.c:461 | cli.c:6838 | cli.c:963 |
| 2025.12.5 | msp_serial.c:552–553 | msp_serial.c:443–444 | msp_serial.c:464 | cli.c:6939 | cli.c:965 |
| 2026.6.0-rc3 | msp_serial.c:556–557 | msp_serial.c:447–448 | msp_serial.c:468 | cli.c:8645 | cli.c:1086 |
| 2026.6.2 | msp_serial.c:556–557 | msp_serial.c:447–448 | msp_serial.c:468 | cli.c:8656 | cli.c:1086 |

### ② `0x02` → 비대화형 (STX/ETX)
| 태그 | `0x02` 수신 → `cliEnter(port, false)` | ETX·2초 종료 | FC가 STX 보냄 |
| --- | --- | --- | --- |
| 4.5.4 | msp_serial.c:549–551 | cli.c:6794–6796 | cli.c:6850 |
| 4.5.5 | msp_serial.c:547–549 | cli.c:6794–6796 | cli.c:6850 |
| 2025.12.5 | msp_serial.c:554–556 | cli.c:6895–6896 | cli.c:6951 |
| 2026.6.0-rc3 | msp_serial.c:558–560 | cli.c:8601–8602 | cli.c:8657 |
| 2026.6.2 | msp_serial.c:558–560 | cli.c:8612–8613 | cli.c:8668 |

- 비대화형은 에코하지 않고(4.5.4 cli.c:6717–6720) 프롬프트도 내지 않습니다(6706–6709). 아밍 금지는 대화형일 때만 겁니다(6836–6844).

### ③ 대기 중인 `'#'`가 취소되는 조건
- 4.5.3: 수신 묶음이 들어올 때마다 대기 요청을 지웁니다(msp_serial.c:519–522).
- 4.5.4 / 4.5.5: 대기 상태에서 새 수신 묶음이 오면 지웁니다(msp_serial.c:529–534). 주석에는 `'#\r'`가 취소되지 않게 했다고 쓰여 있지만, 같은 묶음일 때만 해당합니다.
- 2025.12.5 이후: `'$'`(MSP 프레임 시작)일 때만 지웁니다(msp_serial.c:535–539).

### ④ MSP DisplayPort UART 제외 (2025.12+)
- 2025.12.5 msp_serial.c:543–546, 2026.6.x msp_serial.c:549 부근: `displayPortMspGetSerial()` 포트에서는 `'#'`·`0x02`·재부팅 문자를 처리하지 않습니다. O4 기체는 DisplayPort가 UART에 있고, 우리는 USB VCP로 연결하므로 영향이 없습니다.

### ⑤ 2026.6의 MSP 설정 명령 — **쓰지 않음**
- 2026.6.0-rc3 msp_protocol_v2_betaflight.h:37–38 `MSP2_CLI_SETTING 0x3010`, `MSP2_CLI_SETTING_INFO 0x3011`
- msp.c:2712–2755: 페이로드가 `이름`이면 `이름 = 값`을 돌려주지만, `=`가 들어 있으면 **값을 바꿉니다**(2724–2729). 쓰기 경로가 있으므로 읽기 전용 원칙상 쓰지 않습니다. 2025.12.5에는 없습니다.

### Configurator (github.com/betaflight/betaflight-configurator, `2866d88` 2026-10-16, GPL-3.0)
- CLI 탭: `src/composables/useCli.ts:801–811` — 탭을 열고 250 ms 뒤 `0x23`(`'#'`) 1바이트를 보냅니다. **버전에 따른 분기는 없습니다.**
- STX/ETX: `src/js/msp.ts:98–99`(STX `0x02`, ETX `0x03`), `319–331` `encode_message_cli` = `STX + 명령 + LF + ETX`
- 쓰는 곳: `src/composables/useMspCliSession.ts:35` `MIN_FC_VERSION_FOR_MSP_CLI = "4.5.4"`, `89–98` `isMspCliSupported()` → 백업 탭(`BackupsTab.vue:343`)과 프리셋 탭에서만 사용

### drone-check (github.com/PSi86/drone-check, `384c836` 2026-06-25)
- **라이선스 파일이 없습니다** (pyproject.toml에도 license 필드 없음). 저작권 기본값에 따라 코드는 참고만 했고 복사하지 않았습니다.
- `drone_check/cli_session.py:26–40` `supports_framed_cli()`: 4.5.4 이상이면 STX/ETX만 씁니다. docstring의 "raw `#` CLI-enter byte를 무시한다"는 위 ①과 맞지 않습니다.
- `cli_session.py:68`: `'#'` 진입 시 `"#\r"`를 보냅니다 → ③의 취소 조건에 걸릴 수 있습니다.

## v2 0단계: 편집·쓰기에 필요한 CLI 동작 (소스 조사, SITL 확인 전)

SPEC 13절 0단계 중 소스만으로 확인할 수 있는 부분이다. SITL로 실제 출력을 받아 확인하는 일은 남아 있다(아래 "SITL로 확인할 것").

### `get` (인수 없음) = 모든 설정의 값·범위·기본값
- `get <이름>`은 이름에 `<이름>`이 **포함된** 설정을 모두 출력한다(`strcasestr`). 인수가 없으면 빈 문자열이 모든 이름과 맞으므로 **전체 설정**이 나온다(4.5.3 cli.c:4339–4340, 2025.12.5 cli.c:4418).
- 항목마다 출력 순서(4.5.3 cli.c:4345–4362):
  1. `이름 = 값`
  2. PID·레이트 프로필 값이면 `profile N` / `rateprofile N` 줄 (현재 활성 프로필 기준)
  3. 범위 한 줄 (`cliPrintVarRange`, 4.5.3 cli.c:809–860):
     - `Allowed range: <min> - <max>` (숫자)
     - `Allowed values: A, B, C` (열거형), `Allowed values: OFF, ON` (불)
     - `Array length: N` (배열), `String length: <min> - <max>` (문자열)
  4. `Default value: <값>` (`cliPrintVarDefault`, 4.5.3 cli.c:4314–4318)
- 읽기 명령이며 설정을 바꾸지 않는다. 기본값 계산을 위해 RAM에서 설정을 백업·초기화·복원한다(`backupAndResetConfigs` / `restoreConfigs`, 4.5.3 cli.c:4337, 4368). EEPROM에는 쓰지 않는다.
- 앱 화이트리스트는 지금 `get <이름>`만 허용한다(`[a-z0-9_]{1,64}`). v2에서 인수 없는 `get`을 추가하려면 화이트리스트에 정확히 `get` 한 단어만 추가한다.

### 오류 문구 (쓰기 응답 검사용)
- 모든 CLI 오류는 `###ERROR IN <명령>: <내용>###` 형식이다(`cliPrintErrorVa`, 4.5.3 cli.c:431–442, 2025.12.5 cli.c:442–453). 끝에도 `###`이 붙는다.
- `set`: `INVALID NAME: <이름>`, `INVALID VALUE`, `STRING MUST BE 1-<n> CHARACTERS OR '-' FOR EMPTY` (4.5.3 / 2025.12.5 같음)
- 그 밖: `PARSING FAILED`, `INVALID ARGUMENT COUNT`, `<이름> NOT BETWEEN <a> AND <b>`, `ARGUMENT OUT OF RANGE`
- 모르는 명령: 대화형은 `###ERROR IN input: UNKNOWN COMMAND, TRY 'HELP'###`, STX/ETX 비대화형은 `ERR_CMD_NA: <명령>`(4.5.4 cli.c:6695–6700)
- → 응답 검사는 **`###ERROR` 포함 여부**와 비대화형의 **`ERR_CMD_NA:`** 로 한다. SPEC 11절의 "`Invalid`, `Unknown`" 같은 단어 검사는 정상 출력에도 걸릴 수 있어 쓰지 않는다.

### `batch` 와 `save` — 오류가 있으면 저장이 거부된다
- `batch start` 뒤에 오류가 하나라도 나면 플래그가 서고(cli.c `commandBatchError`, 4.5.3:445–447), **그 상태의 `save`는 저장하지 않는다**(`prepareSave`/`tryPrepareSave`, 2025.12.5 cli.c:4268–4274). 2026.6.2는 `ERRORS WERE DETECTED - PLEASE REVIEW BEFORE CONTINUING` + `PLEASE FIX ERRORS THEN 'SAVE'`를 출력한다(cli.c:5022).
- 그런데 **`batch end`는 이 플래그를 지운다**(2025.12.5 cli.c:4255–4261). `batch end` → `save` 순서이면 오류가 있어도 저장된다.
- 펌웨어의 실제 `diff all` / `dump all` 출력은 `batch start`로 시작해 **`batch end` 없이 `save`로 끝난다**(사용자 Pavo20 2025.12.2 덤프에서 확인).
- → **SPEC 10절의 내보내기 예시(`batch end` 다음 `save`)는 펌웨어 방식과 다르고 보호 장치를 잃는다.** 펌웨어 출력대로 `batch start` … `save`(batch end 없음)로 만든다.

### `save noreboot`
| 펌웨어 | `save` | `save noreboot` |
| --- | --- | --- |
| 4.5.3 | 저장 후 재부팅 | 없음 (인수 무시 → 재부팅) |
| 4.5.4·4.5.5 | 저장 후 재부팅 | 저장만, 재부팅 안 함 (4.5.5 cli.c:4248) |
| 2025.12.5·2026.6.2 | 같음 | 같음 (2025.12.5 cli.c:4317) |

- 4.5.4+에서 `save noreboot`을 쓰면 재부팅·COM 포트 재탐색 없이 같은 연결에서 바로 다시 읽어 재검증할 수 있다(SPEC 11절 7~8단계를 단순화). 저장한 값 중 재부팅해야 적용되는 것(포트·수신기·모터 프로토콜 등)이 있으므로, 재검증 뒤에는 사용자에게 재부팅(USB 다시 꽂기)을 안내한다.

### 쓰기에 쓸 CLI 진입 방식 (결정 필요)
| | `'#'` 대화형 | `0x02` STX/ETX 비대화형 (4.5.4+) |
| --- | --- | --- |
| 응답 경계 | 프롬프트 `"\r\n# "` | 명령마다 `STX … ETX` |
| 에코 | 있음(지워서 비교) | 없음 |
| 세션 길이 | 제한 없음 | **진입 후 2초**가 지나 도착한 바이트에서 종료(cli.c 6794). 명령 하나씩 새 세션 |
| `batch` 오류 보호 | 한 세션 안에서 batch → save 가능 | 세션이 명령마다 끊기면 batch 상태가 이어지는지 SITL 확인 필요 |
| 4.5.3 | 됨 | **없음** |

→ 4.5.3(Meteor75 Pro)을 지원하려면 쓰기는 **`'#'` 대화형**이 기본이 된다. STX/ETX는 4.5.4+에서 읽기(아밍 금지·재연결 없음)에만 쓰는 쪽이 단순하다. 최종 결정은 SITL 확인 후.

### SITL 실측 결과 (2026-10-20, WSL2 Ubuntu 24.04)

SITL을 4.5.3 · 4.5.5 · 2025.12.5 · 2026.6.2로 빌드해(`make TARGET=SITL` / `make SITL`, 2025.12는 `make configs` 후) TCP 127.0.0.1:5761로 시험했다.
- 원문: `fixtures/sitl-<버전>/` (version·status·diff·dump·read-result.json·probe.json)
- 재실행: `scripts/sitl/run-all.ps1`
- 검사: `tests/sitlFixtures.test.tsx`

| 확인 항목 | 4.5.3 | 4.5.5 | 2025.12.5 | 2026.6.2 |
| --- | --- | --- | --- | --- |
| **앱 리더(`'#'` + 화이트리스트)로 4개 명령 읽기** | ✅ 1.2초 | ✅ 1.1초 | ✅ 1.2초 | ✅ 1.1초 |
| 해석 못 한 줄 | 0 | 0 | 0 | 0 (수정 후 — 아래 배터리 프로필) |
| 배너 | `type 'exit' to return` | `type 'exit' to reboot` | 같음 | 같음 |
| STX/ETX 비대화형 (`STX version LF ETX`) | ❌ 응답 없음 | ✅ `STX # Betaflight … ETX` | ✅ | ✅ |
| STX/ETX 모르는 명령 | — | `ERR_CMD_NA: nosuchcmd` | 같음 | 같음 |
| 인수 없는 `get` | 1060줄, 0.42초 | 1060줄 | 1132줄 | 1351줄 |
| 없는 이름 `set` | `###ERROR IN set: INVALID NAME: no_such_setting = 1###` | 같음 | 같음 | 같음 |
| 범위 밖·열거형 오타 | `###ERROR IN set: INVALID VALUE###` + `Allowed range/values` 줄 | 같음 | 같음 | 같음 |
| 성공한 `set` | `craft_name set to PROBE` | 같음 | 같음 | 같음 |
| 모르는 명령(대화형) | `###ERROR IN input: UNKNOWN COMMAND, TRY 'HELP'###` | 같음 | 같음 | 같음 |
| `batch start` → 오류 → `save` | ✅ **저장 거부** (`###ERROR IN save: ERRORS WERE DETECTED …###`, `PLEASE FIX ERRORS THEN 'SAVE'`) | ✅ | ✅ | ✅ |
| `save noreboot` | ❌ 재부팅함 (`Rebooting`, 연결 끊김) | ✅ `# saving`, 연결 유지, 값 저장됨 | ✅ | ✅ |

**실측으로 새로 알게 된 것**
- **`get`의 `Default value:` 줄은 현재 값이 기본값과 다를 때만 나온다.** 기본 상태 SITL에서는 0줄이었다. 바꾼 뒤 `get craft_name`에서 `Default value: -`가 나왔다. → 스키마(범위·허용값)는 `get`에서, 기본값은 `diff all`과 비교해서 얻는다.
- **연결을 끊어도 FC는 CLI 모드에 남는다.** 다시 연결해 `'#'`을 보내면 CLI 안에서는 주석 문자라 응답이 없고, 다음 명령 앞에 붙어 `#get`처럼 무시된다. 앱이 "USB를 뽑았다 다시 꽂으세요"라고 안내하는 이유가 실제로 확인됐다. 쓰기 절차에서는 진입 실패 시 같은 안내를 해야 한다.
- **2026.6부터 배터리 설정이 `battery_profile 0~2` 섹션으로 나뉜다** (`bat_capacity`, `vbat_*_cell_voltage`, `cbat_alert_percent`, `force_battery_cell_count`, `battery_profile_name` — settings.h `PROFILE_BATTERY_VALUE`). `waypoint` 줄도 새로 생겼다.
  - 기존 파서는 이 `set` 줄들을 **마지막 레이트 프로필에 잘못 넣고** 있었다.
  - → 파서에 `battery_profile` 범위를 추가하고(키 `battery.N.<키>`), 전원 탭에 배터리 프로필 패널을 넣었다. 키 목록 추출기도 battery 섹션을 구분하도록 고쳤다.
- SITL 빌드는 OSD·GPS·VTX 등이 빠져 master 키가 186~275개로 실기체보다 적다. 키 이름·형식 확인용이며, 탭 화면의 최종 확인은 실기체 덤프로 한다.

### 0단계 결론 — v2 쓰기 방식

1. **진입은 `'#'` 대화형으로 한다.** 모든 버전에서 동작하고, 4.5.3(Meteor75 Pro)에는 STX/ETX가 없다. STX/ETX는 쓰기에 쓰지 않는다.
2. **전송 순서는 펌웨어 `diff all`과 같게 `batch start` → 변경 명령 → `save`로 하고, `batch end`는 넣지 않는다.** 앱이 줄마다 `###ERROR`를 검사해 하나라도 있으면 `save`를 보내지 않는다. 그래도 `save`가 나가면 펌웨어가 저장을 거부한다(4개 버전 실측). 이중 보호다.
   - SPEC 10절 내보내기 예시의 `batch end`는 빼야 한다.
3. **오류 판정은 응답에 `###ERROR`가 있는지로 한다.** 성공한 `set`은 `<이름> set to <값>`을 출력하므로, 이 줄이 있는지도 함께 확인할 수 있다.
4. **재검증:**
   - 4.5.4+: `save noreboot` → 같은 연결에서 다시 읽어 대조 → 사용자에게 USB 다시 꽂기 안내
   - 4.5.3: `save`가 항상 재부팅하므로 재연결(SPEC 11절 7단계) 후 대조
5. **스키마:** 읽기 화이트리스트에 인수 없는 `get`(정확히 `get` 한 단어)을 추가하면 범위·허용값을 0.4초 안에 받을 수 있다(SPEC 9절).
6. 쓰기를 허용할 펌웨어는 실측한 계열(4.5.x, 2025.12.x, 2026.6.x)로 한정하고, 그 밖은 "이 펌웨어는 아직 쓰기를 지원하지 않습니다"로 막는다(SPEC 11절).

### 4단계 SITL 실측 — 변경분 파일 붙여 넣기 (2026-10-21)
`scripts/sitl/run-paste.ps1` → `tests/sitl.paste.test.ts`. 앱이 만든 변경분 파일(master·PID 2개 프로필·레이트 2개·배터리·aux·serial·feature·map·rxfail, 50개 안팎)을 한 줄씩 보내고 `dump all`로 대조. save는 보내지 않음.

| | 4.5.3 | 4.5.5 | 2025.12.5 | 2026.6.2 |
| --- | --- | --- | --- | --- |
| 모든 줄 `###ERROR` 없음, dump 값 = 편집 값 | ✅ | ✅ | ✅ | ✅ |

**`###ERROR` 없이 실패하는 응답** (5단계 응답 검사에 넣어야 함):
- 2025.12+ `feature X`: 펌웨어에 빌드되지 않은 기능이면 **`Unavailable X`** 만 출력하고 바꾸지 않는다. `###ERROR`가 아니어서 batch 오류 플래그도 서지 않는다(save가 그대로 저장됨). 성공하면 `Enabled X` / `Disabled X`. dump에는 빌드되지 않은 기능도 `feature -X`로 나오므로 미리 알 수 없다.
  - SITL 2025.12.5: RX_PPM·RX_SERIAL·GPS·OSD 등이 Unavailable. 4.5.x는 같은 명령을 받아들인다.
- `rxfail 0 h`(스틱 채널에 유지)는 펌웨어가 받아들인다. 앱은 SPEC대로 막는다(더 엄격).

**`###ERROR`가 나오는 것**: 없는 포트 `serial UART9 ...` → `PARSING FAILED`, `map XXXX1234` → `PARSING FAILED`, `profile 9` → `PROFILE OUTSIDE OF [0..3]`.

**읽기 끝 판정 보강**: 같은 판정(프롬프트 `\n# ` + 150ms 조용)을 쓰던 테스트 도구에서 SITL 4.5.3 `dump all`이 `# ...` 주석 줄 경계에서 한 번 잘렸다. `diff all`/`dump all`은 항상 `save` 줄로 끝나므로, 앱 리더(`responseComplete`)는 이 둘에 한해 `save` 다음의 프롬프트를 기다린다.

### 5단계 SITL 실측 — 쓰기 절차 전체 (2026-10-21)
`scripts/sitl/run-write.ps1` → `tests/sitl.write.test.ts`. SITL 은 감시 루프로 띄운다(`scripts/sitl/sitl.sh`): SITL 은 재부팅(save)하면 프로세스가 끝나므로 루프가 같은 eeprom 으로 다시 띄워 실제 FC 재부팅을 흉내 낸다. `powercycle` = USB 뽑았다 꽂기(저장 안 한 값은 사라짐).

| 시나리오 | 4.5.3 | 4.5.5 | 2025.12.5 | 2026.6.2 |
| --- | --- | --- | --- | --- |
| 정상: 백업 → 전송 → save → (재연결) → 재검증 일치, 다시 켜도 값 유지 | ✅ (save 재부팅 → 재연결) | ✅ (save noreboot) | ✅ | ✅ |
| 기체가 `###ERROR`로 답함 → save 없이 멈춤, 다시 켜면 원래 값 | ✅ | ✅ | ✅ | ✅ |
| 전송 중 기체 쪽 연결 끊김 → save 없음, 다시 켜면 원래 값 | ✅ | ✅ | ✅ | ✅ |
| 펌웨어 빌드가 다름 → 쓰지 않음(읽기 명령만 나감) | ✅ | ✅ | ✅ | ✅ |
| 충돌 → 묻기, "덮기" → 같은 연결로 씀 | ✅ | ✅ | ✅ | ✅ |
| 백업으로 되돌리기(차이만, defaults 없음) → 다시 켜면 원래 값 | ✅ | ✅ | ✅ | ✅ |

간헐 실패가 몇 번 있었고(원인 기록 없음, SITL 시작 타이밍으로 추정) 다시 돌리면 통과했다. 마지막 두 바퀴는 4개 버전 모두 6/6. 이후 실패하면 러너가 전체 출력을 `%TEMP%\sitl-write-<버전>.log` 에 남긴다.

**펌웨어가 save 때 고치는 값** (재검증에서 "다시 읽은 값이 다릅니다"로 나온다 — 정상 동작):
- `gyro_notch*_hz` / `dterm_notch_hz` 를 cutoff 보다 낮게 주면 0(끔)
- `mag_align_*` (지자기계 없음) → 0, `vbat_sag_compensation` → 0 (SITL)
- MSP 포트가 하나도 없게 하면 첫 포트에 MSP 를 되살린다 → 앱은 이런 편집을 오류로 막는다

**연결 상태**: 연결을 끊어도(exit 없이) FC 는 CLI 모드에 남는다. 다시 연결해 `'#'` 을 보내면 진입 배너 없이 `#` 에코만 온다(SITL·실기체 Meteor75 Pro2W 확인). 앱은 이때 빈 줄을 보내 프롬프트를 받고 그대로 진행한다(`enterCli`, 읽기 화이트리스트에 빈 줄 추가 — CLI 에서 빈 줄·주석 줄은 아무 동작도 하지 않음). 그래서 읽은 뒤 USB 를 다시 꽂지 않아도 쓸 수 있다.

**save 응답 유실 (실기체 2026-10-21)**: 4.5.3 기체에서 `save` 에코 직후 0.1초 만에 USB 가 끊겨 `# saving` / `Rebooting` 이 PC 에 오지 않은 일이 있었다(로그 `write_20261021.log`). 같은 기체의 다른 쓰기에서는 끊기기 전에 도착했다. 앱은 save 뒤 연결이 끊기면 재부팅으로 보고 다시 연결해 재검증한다(적용 여부는 재검증이 판단). 응답도 없고 끊기지도 않으면 SAVE_UNKNOWN.

**재부팅 직후 연결**: 재부팅 중인 기체(SITL)에 너무 일찍 붙은 연결은 끝까지 답하지 않는다. 앱은 CLI 진입을 3번 시도하고, save 재부팅 뒤 재연결에서는 시도마다 연결을 새로 연다(15초 안). SITL 은 재시작 뒤 새 연결로 약 3초 안에 답한다(8번 측정).

**SITL 4.5.3 불안정**: 4.5.3 SITL 은 가끔 재시작 뒤 30초 넘게 답하지 않거나 `dump all` 중에 멈춘다(프로세스는 살아 있음). 다른 버전에서는 보이지 않았다. 4.5.3 쓰기 테스트가 실패하면 먼저 이 증상인지 로그(`받은 내용 ""`, `TIMEOUT: dump all`)로 확인한다. 2026-10-21 기준 4.5.3 연속 5번 중 3번 전부 통과, 실패한 2번은 이 증상.

**읽기 깨짐**: SITL 4.5.x 에서 save noreboot 직후 dump 바이트가 빠져 줄이 붙은 일이 있었다. 쓰기 절차의 읽기는 `rawLooksComplete()`(해석 못 한 줄 없음, save 로 끝남)를 확인하고 최대 3번 다시 읽는다(`readClean`).

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

## 2025.12 설정 변경과 파서·화면 대응 (3단계)

SITL은 건너뛰었습니다. 대신 각 태그의 `src/main/cli/settings.c`에서 설정 이름과 섹션을 모두 뽑아 `fixtures/settings-names/{4.5.5,2025.12.5,2026.6.2}.json`에 두었습니다. 테스트(`tests/firmwareCompat.test.tsx`)는 **화면과 샘플이 쓰는 키 이름이 이 실제 목록에 있는지** 검사합니다.

| 변경 | 4.5.x | 2025.12.x | 근거 | 앱 대응 |
| --- | --- | --- | --- | --- |
| serial 줄 포트 표기 | `serial 1 64 ...` (0~9 = UART1~10, 20 = VCP) | `serial UART2 64 ...` — 이름 `VCP`·`UART0~10`·`SOFT1~2`·`LPUART1` | cli.c `printSerial` 형식 `%d` → `%s`+`serialName()`; io/serial.c:147–196 이름표 | 파서가 숫자·이름 모두 읽음, 키는 `serial.UART2` |
| 포트 식별자 번호 | UART1 = 0 | VCP = 20, SOFT = 30+, LPUART = 40, UART0 = 50, **UART1 = 51** | io/serial.h:84–117 (2025.12.5) | `portName()`이 0~9와 50~60을 모두 UART로 해석 |
| D 항 | `d_roll` = **최대** D (기본 40), `d_min_roll` = 기본 D (30) | `d_roll` = **기본** D (30), `d_max_roll` = 최대 D (40) | flight/pid.h `PID_ROLL_DEFAULT`, `D_MIN_DEFAULT`/`D_MAX_DEFAULT`; settings.c `d_min_roll`(4.5.5:1191) / `d_max_roll`(2025.12.5:1329) | PID 표 열 이름을 덤프 키로 결정: 4.5 "D (최대) / D Min (기본)", 2025.12 "D (기본) / D Max (최대)" + 설명 줄 |
| S 항 | 없음 | `s_roll/pitch/yaw` (pidf_t.S) | flight/pid.h:145–151 | PID 표에 S 열 (있을 때만) |
| 간편 튜닝 D Max 슬라이더 | `simplified_dmax_gain` | `simplified_d_max_gain` | settings.c 비교 | 둘 다 표시(있는 것만) |
| 페일세이프 착륙 시간 | `failsafe_off_delay` (0.1초, 기본 10) | `failsafe_landing_time` (초, 기본 60) | flight/failsafe.c:75 / 76, failsafe.h:38 | 각각 단위 맞춰 표시 |
| 모터 아이들 | `dshot_idle_value` | `motor_idle` (같은 0.01% 단위) | settings.c:962, drivers/dshot.c:62 | 있는 키로 % 표시 |
| GPS 레스큐 | `gps_rescue_throttle_*`, `_landing_alt` 등 | 이 키들이 빠지고 `ap_*`(오토파일럿)·`alt_hold_*`·`pos_hold_*` 추가. 2026.6에서는 `gps_rescue_velocity_*`·`_max_angle` 등도 `ap_*`로 | settings.c 비교 | GPS 탭에 "오토파일럿" 패널, `ap_`·`alt_hold_`·`pos_hold_`·`poshold_`를 GPS 탭에 매핑 |
| 자이로 정렬 | `gyro_1_sensor_align`, `gyro_1_align_*` | set 키 없음 (`gyro_enabled_bitmask` 추가) | 2025.12.5 settings.c에 gyro 정렬 항목 없음 | 구성 탭에 안내 문구 |
| 그 밖 | `min_throttle`, `gyro_to_use`, `rc_smoothing_feedforward_cutoff`, `crashflip_expo`, `iterm_limit`, `dyn_idle_start_increase` | 삭제 또는 `crashflip_rate` 등으로 변경, `thr_hover`(레이트) 추가 | settings.c 비교 | 없는 키는 줄이 숨겨지고, 새 키는 해당 탭 또는 "기타"에 표시 |

### 이 조사에서 함께 고친 기존 오류
4.5 실제 키 목록과 대조해 보니, 앱과 합성 샘플에 **실제로 없는 키 이름**이 있었습니다.

| 잘못 쓴 이름 | 실제 이름 | 영향 |
| --- | --- | --- |
| `dyn_lpf_dterm_min_hz/max_hz/curve_expo` | `dterm_lpf1_dyn_min_hz/max_hz/expo` | PID 필터 탭의 D-term 동적 필터 3개가 숨겨지고 "그 밖의 프로필 값"으로 밀려났음 |
| `gps_ublox_mode` | `gps_ublox_flight_model` | GPS 탭에 안 보였음 |
| `osd_warn_*` (개별 ON/OFF) | `osd_warn_bitmask` (비트마스크) | 4.5는 비트마스크 — 토글 대신 숫자로 표시 |
| `osd_stat_bitmap` | `osd_stat_bitmask` | 같음 |
| `displayport_msp_serial`, `displayport_msp_attrs` | 없음 (DisplayPort UART는 serial 기능 비트 `VTX_MSP`로 정함) | 포트·OSD 탭에서 제거 |
| `angle_level_strength`, `horizon_transition` | 4.5.5·2025.12.5·2026.6.2 모두에 없음 | PID 탭에서 제거 |
| 4.5 샘플의 `d_max_*` | 4.5는 `d_min_*` (의미도 반대) | 샘플 수정, 2025.12.5 형식 샘플 `moz7-2025.12` 추가 |

## 이 앱에 주는 영향

1. **지금 리더(`'#'` 한 바이트)는 조사한 모든 버전에서 동작해야 합니다.** 2단계 SITL과 저녁 실기체 테스트로 확인합니다.
2. 배너 확인을 `"Entering CLI Mode"` 문자열로 하고 있어 `MINIMAL_CLI` 빌드(`"CLI"`만 출력)에서는 실패합니다. → 4단계에서 배너 문자열 대신 **프롬프트(`"\n# "`) 기준**으로 바꿉니다.
3. 4.5.4+에서는 STX/ETX 방식이 **USB를 다시 꽂을 필요가 없고 아밍 금지도 남지 않아** 사용자에게 더 편합니다. 쓰려면 화이트리스트를 "허용된 읽기 명령 + STX/LF/ETX 틀"로 넓혀야 합니다. 이 방식을 쓸지는 결정이 필요합니다.
4. `'#'` 뒤에 개행 등 다른 바이트를 붙여 보내면 안 됩니다(4.5.3~4.5.5 취소 조건). 지금 코드는 이미 그렇게 하고 있으며, 테스트로 고정합니다.

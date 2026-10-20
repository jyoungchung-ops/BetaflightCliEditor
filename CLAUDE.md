# Betaflight CLI Editor (v1: FC CLI Viewer)

Betaflight 기체의 CLI 값을 USB로 읽어 Betaflight App과 같은 탭 구조로 보여주는 **읽기 전용** Electron 앱. 전체 요구사항은 [docs/SPEC.md](docs/SPEC.md).

## 절대 원칙
- 보기·편집 모드에서는 FC에 쓰기 명령을 보내지 않는다. 읽기 송신 함수(`CliReader.send()`)는 하나만 두고 화이트리스트(`#`, `version`, `status`, `diff all`, `dump all`, `get <이름>`)만 허용한다.
- Betaflight 로고는 쓰지 않는다. 앱 이름은 SPEC 8절대로 "Betaflight CLI Editor"를 쓰되, README·설명에 "Betaflight 공식 프로그램 아님"을 밝힌다. configurator(GPL) 코드는 복사하지 않고 구조만 참고한다.

## v2 (Betaflight CLI Editor) 규칙 — SPEC 8~13절, 작업 브랜치 `v2`
- **0단계 결론 전에는 기체에 쓰는 코드(SPEC 13절 5단계)를 만들지 않는다.** 0단계 결과는 `docs/cli-compat.md`에 적는다.
- 앱은 항상 보기 모드로 시작한다. 편집은 상단 바 [편집] 토글, 쓰기는 편집 모드의 [기체에 쓰기] + 11절 절차(안전 확인 → 읽기 → 일치 검사 → 백업 → 미리보기·이름 입력 → 전송 → save → 재검증)로만.
- 읽기 화이트리스트는 그대로 둔다. 쓰기 송신은 **별도 함수 `writeSession`** 하나로만 하고, 11절 절차 안에서만 호출된다. 소스 검사 테스트로 이를 지킨다(v1의 `tests/cliReader.test.ts` 방식).
- `writeSession`이 보낼 수 있는 것: SPEC 10절 표의 생성 명령(`set`, `feature`, `aux`, `adjrange`, `serial`, `map`, `rxfail`) + `profile`, `rateprofile`, `battery_profile`(2026.6+), `batch start`, `save` 뿐 (`isGeneratedCommand`). 그 밖은 차단(12절 목록: `defaults`, `bl`, `dfu`, `flash_erase`, `resource`, `timer`, `dma`, `msc`, `serialpassthrough`, `motor`, `play_sound`, `vtx_info` 등).
- MSP로 쓰지 않는다. 2026.6+의 `MSP2_CLI_SETTING`(0x3010)은 페이로드에 `=`가 있으면 값을 바꾸므로 보내지 않는다(`docs/cli-compat.md` ⑤).
- 기체에는 바뀐 값만 보낸다. 전체 dump로 덮어쓰지 않고, `defaults`를 쓰는 복원도 하지 않는다.
- 명령 생성(`buildCommands`)은 파서의 역방향이다. 생성 → 파싱 왕복 테스트로 같은 값이 나와야 한다. serial 줄 등 펌웨어별 형식은 파서가 읽은 형식을 그대로 따른다.
- SPEC 11절의 "framed MSP-CLI" 전제는 소스 조사와 다르다: 모든 조사 버전에서 `'#'` 진입이 되고, 4.5.4+에 추가된 것은 MSP가 아닌 STX/ETX 비대화형 모드다(`docs/cli-compat.md`). 어느 쪽으로 쓸지는 0단계에서 정한다.

## 펌웨어 버전 호환성
- CLI 진입·버전별 키 변경 조사 결과는 [docs/cli-compat.md](docs/cli-compat.md). 저녁 실기체 테스트는 [docs/hw-test-checklist.md](docs/hw-test-checklist.md)
- 키 이름을 화면에 추가할 때는 `fixtures/settings-names/*.json`(실제 펌웨어 목록)에 있는 이름만 쓴다 — `tests/firmwareCompat.test.tsx`가 검사
- 4.5와 2025.12에서 `d_roll`의 의미가 반대(최대 ↔ 기본). serial 줄은 2025.12부터 포트 이름

## 구조
- `src/main/` — Electron 메인 프로세스(시리얼, 파일 저장/열기)
- `src/preload/` — `contextBridge`로 `window.bfview` 노출
- `src/renderer/` — React UI (`tabs/`, `components/`, `styles/`)
- `src/shared/` — 메인·렌더러 공용 (IPC 타입, 탭 목록, CLI 파서, 키 매핑)
- `fixtures/` — 세 기체의 `diff all`/`dump all` 텍스트(파서 테스트용)

## 명령
- `npm run dev` — 개발 실행
- `npm run typecheck` / `npm test`
- `npm run build` — electron-vite 빌드

## v2 진행 상태 (SPEC 13절)
0. 선행 검증 — 완료 (`docs/cli-compat.md` "SITL 실측 결과", "0단계 결론")
   - SITL: WSL2 Ubuntu-24.04 `~/bf-sitl/<태그>/obj/main/betaflight_SITL.elf`, 재실행 `scripts/sitl/run-all.ps1`
   - 앱은 개발 실행에서만 `tcp://127.0.0.1:5761` (SITL) 포트를 보여 준다(`src/main/serial/tcpTransport.ts`, 배포 exe에서는 꺼짐)
   - `scripts/sitl/probe.mjs` 는 SITL 전용 실험 도구(루프백만). 앱 코드에서 쓰지 않는다
   - 쓰기 방식 결론: `'#'` 진입, `batch start` → 명령 → `save`(batch end 없음), `###ERROR` 검사, 4.5.4+는 `save noreboot` 후 재검증
1. 이름 변경 — 완료 (Betaflight CLI Editor 2.0.0, appId app.bfclieditor.editor, exe Betaflight-CLI-Editor-Setup/Portable-2.0.0). 앱 동작은 v1과 같음
2. 스키마 — 완료
   - 읽기 화이트리스트에 인수 없는 `get` 추가, 읽기 순서 5번째 (`READ_COMMANDS`)
   - `src/shared/cli/schema.ts`: `parseGetSchema()`(get 출력 → 설정별 형식), `validateValue()`(범위 검사)
   - `CraftSnapshot.schema` 는 `raw.get` 에서 다시 만든다. 저장 파일 `schemaVersion: 2`, v1 파일은 schema 없이 열림
   - 검사: `tests/schema.test.ts` (SITL 4개 버전 실측 get.txt)
3. 편집 모드 — 완료 (기체에 쓰지 않음, 화면에서만 고침)
   - 상태: `src/shared/edit/session.ts` (원본 보존, `effective()`, 되돌리기/다시 하기, `validateEdits()`, 탭 배지 `countByTab()`)
   - 화면: `ui/editContext.tsx`(`useEdit`), `widgets.tsx`의 `ValueEditor`·`useEditMark`·`CellValue`·`FeatureToggle`. 상단 바 [편집]은 schema(get) 없으면 꺼짐
   - 줄 편집(aux·serial·map·rxfail·feature)의 값은 CLI 한 줄 전체이고, 화면 반영은 같은 파서로 한다
   - 끌기(모드 범위·OSD 요소)는 `setValue(..., { merge: true })`로 되돌리기 한 단계
   - USB VCP의 MSP 끄기는 오류(재연결 불가). 저장 파일에 `edits` 배열 저장, schema는 저장하지 않음(raw.get에서 다시 만듦)
   - 검사: `tests/edit.test.tsx`
4. 명령 생성·내보내기 — 완료
   - `src/shared/edit/commands.ts`: `buildCommands()`(batch start → 줄 → master → profile/rateprofile/battery_profile → save, batch end 없음, 원래 활성 프로필 복원), 오류가 있으면 `EditValidationError`
   - 내보내기: 변경분 `<이름>_changes_<날짜>.txt`, 편집 반영 전체 diff `<이름>_diff-edited_<날짜>.txt`(원본 diff 줄을 그 자리에서 바꿈). 상단 바 [내보내기] 메뉴, IPC `exportText`
   - 검사: `tests/commands.test.ts`(왕복), `tests/sitl.paste.test.ts`(SITL 4개 버전 붙여 넣기 — `scripts/sitl/run-paste.ps1`)
   - 2025.12+ `feature X`는 빌드에 없으면 `Unavailable X`(###ERROR 아님) → 5단계 응답 검사에 포함 (`docs/cli-compat.md`)
   - 읽기 끝 판정: diff all/dump all 은 save 다음 프롬프트까지 기다림 (`responseComplete`)
5. SITL에 쓰기 — 완료 (실제 기체 첫 쓰기 테스트는 사용자가 한다, SPEC 13절 끝)
   - 송신: `src/main/serial/writeSession.ts` (유일한 쓰기 송신, `isGeneratedCommand` 검사, `###ERROR`·`Unavailable`·save 거부 검사)
   - 절차: `src/main/serial/writeFlow.ts` (Electron 무관 — SITL 테스트가 그대로 씀), IPC `writeIpc.ts`, 검사 `src/shared/edit/writePlan.ts`
   - 화면: `components/WriteDialog.tsx` (안전 확인 → 읽기 → 충돌 질문 → 미리보기·이름 입력 → 결과·재검증)
   - 백업 `<저장폴더>\backups\<이름>_<날짜시각>_before-write.txt/.bfview.json`, 로그 `<저장폴더>\logs\write_<날짜>.log`
   - 검사: `tests/writeSession.test.ts`(가짜 FC, 차단 명령), `tests/sitl.write.test.ts`(SITL 4개 버전, 오류 주입 — `scripts/sitl/run-write.ps1`)
   - SITL 은 감시 루프로 띄움(`~/sitl.sh start|powercycle|stop`) — 저장소 `scripts/sitl/sitl.sh` 를 WSL `~/sitl.sh` 로 복사해 씀
6~7. 대기

## v1 진행 상태 (SPEC 7절) — 완료, v0.1.0 배포
1. 뼈대 — 완료
2. 파서 — 완료 (`src/shared/cli/parser.ts`, 합성 샘플로 테스트). 실제 덤프를 `fixtures/`에 넣으면 자동 검증
   - 설정 항목 키 체계: `master.<k>`, `pid.<n>.<k>`, `rate.<n>.<k>`, `feature.<X>`, `serial.<id>`, `aux.<i>`, `adjrange.<i>`, `rxfail.<ch>`, `led.<i>` …
3. 시리얼 리더 — 완료 (`src/main/serial/`), 가짜 FC(`tests/fakeFc.ts`)로 테스트. 실제 기체 확인은 아직
   - FC 송신은 `CliReader.send()` 한 곳뿐. `tests/cliReader.test.ts`의 소스 검사가 이를 지킨다
   - 연결 화면에서 기체 이름 모달은 아직 없음(5단계) — 지금은 FC의 craft_name을 그대로 씀
   - npm 11은 install 스크립트를 막는다: `allowScripts`에 electron 승인, `@serialport/bindings-cpp`는 거부(prebuild 사용)
4. 탭 화면 — 18개 탭 모두 완료 (`src/renderer/src/tabs/`). 실제 기체 덤프로 확인은 아직
   - 접두어로 매핑한 탭(전원 `vbat_`, OSD `osd_` 등)은 따로 배치하지 않은 키를 `RestOfMaster`로 모두 보여 줌
   - `tests/tabs.test.tsx`가 "모든 master 키가 어느 탭에든 표시됨", "변경된 키는 노란 점"을 검사 — 키를 숨기면 실패한다
   - 부품: `ui/widgets.tsx` (MasterField는 펌웨어에 없는 키면 줄을 숨김), `ui/snapshot.tsx`
   - 탭별 master 키 매핑: `src/shared/mapping/tabKeys.ts` — 탭 화면에 키를 추가하면 여기도 추가 (테스트가 검사)
   - 레이트 공식: `src/shared/mapping/rates.ts`, 모드 이름: `mapping/modes.ts`
5. 이름·저장·열기 — 완료. 렌더러 흐름은 브라우저에서 가짜 bridge로 확인, Electron 저장창·드래그는 실제 실행 확인 필요
   - 파일명 규칙·저장 형식: `src/shared/files.ts` (열 때 raw에서 다시 파싱)
   - 저장창·설정(마지막 폴더): `src/main/files.ts`, 드래그 경로는 preload `webUtils.getPathForFile`
   - 단일 인스턴스 + 실행 인자 파일 열기 준비됨 (파일 연결은 6단계 electron-builder에서)
6. 패키징 — 완료. `npm run dist` → `release/`에 설치판·포터블 exe (이 PC에서 빌드·실행 확인)
   - 설정: `electron-builder.yml` (`npmRebuild: false` — serialport N-API prebuild 사용, `.node`는 asarUnpack)
   - 아이콘: `npm run icon` (`scripts/make-icon.mjs`가 코드로 그림)
   - CI: `.github/workflows/build-windows.yml` (windows-latest, `v*` 태그면 Release 초안)
   - `.bfview.json` 파일 연결은 안 함 — Windows가 `.json` 전체를 가져가게 되므로

# FC CLI Viewer

Betaflight 기체의 CLI 값을 USB로 읽어 Betaflight App과 같은 탭 구조로 보여주는 **읽기 전용** Electron 앱. 전체 요구사항은 [docs/SPEC.md](docs/SPEC.md).

## 절대 원칙
- FC에 쓰기 명령을 보내지 않는다. 송신 함수는 하나만 두고 화이트리스트(`#`, `version`, `status`, `diff all`, `dump all`, `get <이름>`)만 허용한다.
- Betaflight 로고·이름을 UI에 쓰지 않는다. configurator(GPL) 코드는 복사하지 않고 구조만 참고한다.

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

## 진행 상태 (SPEC 7절)
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

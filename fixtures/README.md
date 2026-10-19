# fixtures

## 실제 기체 덤프 (여기에 넣기)

Betaflight App CLI 탭에서 `diff all`, `dump all` 결과를 저장해 아래 이름으로 넣습니다.

```
fixtures/meteor75-pro.dump.txt
fixtures/meteor75-pro.diff.txt
fixtures/pavo20-pro2.dump.txt
fixtures/pavo20-pro2.diff.txt
fixtures/moz7.dump.txt
fixtures/moz7.diff.txt
```

`*.dump.txt`가 있으면 `npm test`가 자동으로 검사합니다(펌웨어·보드 인식, 모르는 줄 없음, diff 키가 dump에 모두 있음).
`*.diff.txt`는 같은 이름의 dump와 짝지어집니다.

## settings-names/ — 실제 펌웨어 설정 이름 목록

`4.5.5.json`, `2025.12.5.json`, `2026.6.2.json`은 betaflight 저장소 해당 태그의 `src/main/cli/settings.c`에서 뽑은 **설정 이름과 섹션(master / pid / rate)** 목록입니다(값·기본값은 없음, `#ifdef`와 무관한 상위집합). `tests/firmwareCompat.test.tsx`가 탭 화면과 샘플이 쓰는 키 이름이 실제로 있는지 이 목록으로 검사합니다. 만든 방법은 [docs/cli-compat.md](../docs/cli-compat.md) 참고.

## sample/ — 합성 샘플

`sample/`은 **실제 기체에서 받은 것이 아닙니다.** `node scripts/make-sample-fixtures.mjs`로 만든
Betaflight 4.5 형식의 샘플이며, `*.expected.json`에 기본값과 다른 키 목록(정답)이 들어 있습니다.
키 **이름**은 실제 펌웨어 목록(`settings-names/`)과 대조해 맞췄지만 **값·기본값·줄 순서는 흉내 낸 것**이라, 최종 확인은 실제 덤프로 합니다.
`moz7-2025.12`는 같은 Moz7 설정을 2025.12.5 형식(serial 포트 이름, `d_max_*`, `motor_idle`, `failsafe_landing_time`, `ap_*`)으로 만든 것입니다.

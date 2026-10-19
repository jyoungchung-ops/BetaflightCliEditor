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

## sample/ — 합성 샘플

`sample/`은 **실제 기체에서 받은 것이 아닙니다.** `node scripts/make-sample-fixtures.mjs`로 만든
Betaflight 4.5 형식의 샘플이며, `*.expected.json`에 기본값과 다른 키 목록(정답)이 들어 있습니다.
키 이름과 기본값은 4.5를 흉내 낸 것이라 실제와 다를 수 있으니, 탭 매핑은 실제 덤프로 확인합니다.

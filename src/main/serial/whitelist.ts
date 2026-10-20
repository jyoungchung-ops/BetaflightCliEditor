// FC로 보낼 수 있는 읽기 명령 화이트리스트 (SPEC 3절, v2 9절).
// 쓰기·재부팅·초기화 명령(save, set, defaults, bl, dfu, flash_erase, exit ...)은 여기서 막힌다.
// v2의 쓰기 송신은 이 목록을 넓히지 않고 별도 함수(writeSession)로만 한다 (CLAUDE.md).

/**
 * 'get' (인수 없음): 모든 설정의 값·범위·허용값을 출력하는 읽기 명령 (v2 9절 스키마).
 * cli.c cliGet — 설정을 바꾸지 않는다 (docs/cli-compat.md "v2 0단계").
 */
const EXACT = new Set(['#', 'version', 'status', 'diff all', 'dump all', 'get'])
/** get <이름> — 이름은 설정 키 문자만 (공백·개행·세미콜론 불가) */
const GET = /^get [a-z0-9_]{1,64}$/

export function isAllowedCommand(cmd: string): boolean {
  return EXACT.has(cmd) || GET.test(cmd)
}

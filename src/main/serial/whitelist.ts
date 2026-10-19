// FC로 보낼 수 있는 명령 화이트리스트 (SPEC 3절).
// 쓰기·재부팅·초기화 명령(save, set, defaults, bl, dfu, flash_erase, exit ...)은 여기서 막힌다.

const EXACT = new Set(['#', 'version', 'status', 'diff all', 'dump all'])
/** get <이름> — 이름은 설정 키 문자만 (공백·개행·세미콜론 불가) */
const GET = /^get [a-z0-9_]{1,64}$/

export function isAllowedCommand(cmd: string): boolean {
  return EXACT.has(cmd) || GET.test(cmd)
}

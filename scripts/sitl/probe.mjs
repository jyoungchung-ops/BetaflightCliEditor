// SITL 전용 CLI 실험 도구 (SPEC 13절 0단계). 앱 코드가 아니며 앱은 이 파일을 쓰지 않는다.
// 읽기 화이트리스트 밖의 명령(인수 없는 get, 잘못된 set, batch, save)을 SITL 에서만 시험하려고 만든 것이다.
// 루프백 TCP(127.0.0.1 / localhost / ::1)가 아니면 연결하지 않는다 — 실제 기체(시리얼)에는 절대 쓰지 않는다.
//
// usage: node scripts/sitl/probe.mjs <out.json> [tcp://127.0.0.1:5761]
// 결과 JSON: 각 시험의 보낸 명령과 받은 원문
import { Socket } from 'node:net'
import { writeFileSync } from 'node:fs'

const [outPath, target = 'tcp://127.0.0.1:5761'] = process.argv.slice(2)
const m = /^tcp:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/.exec(target)
if (!outPath || !m) {
  console.error('usage: node scripts/sitl/probe.mjs <out.json> [tcp://127.0.0.1:5761]  (loopback only)')
  process.exit(2)
}

const sock = new Socket()
let buf = ''
sock.on('data', (d) => (buf += d.toString('latin1').replace(/\r/g, '')))
await new Promise((res, rej) => sock.connect(Number(m[2]), m[1] === '[::1]' ? '::1' : m[1], res).once('error', rej))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** 프롬프트("\n# ")로 끝나고 quiet ms 동안 조용하면 끝 */
async function untilPrompt(timeout = 30000, quiet = 300) {
  const t0 = Date.now()
  let last = buf.length
  let still = 0
  while (Date.now() - t0 < timeout) {
    await sleep(50)
    if (buf.length !== last) {
      last = buf.length
      still = 0
    } else still += 50
    if (/\n# $/.test(buf) && still >= quiet) return true
  }
  return false
}
async function cmd(line, timeout) {
  buf = ''
  sock.write(line + '\n')
  const ok = await untilPrompt(timeout)
  return { cmd: line, ok, out: buf }
}
/** STX/ETX 비대화형: STX cmd LF ETX → STX ... ETX */
async function framed(line, timeout = 5000) {
  buf = ''
  sock.write(Buffer.from([0x02, ...Buffer.from(line, 'latin1'), 0x0a, 0x03]))
  const t0 = Date.now()
  while (Date.now() - t0 < timeout && !buf.includes('\u0003')) await sleep(20)
  return { cmd: `STX ${line} LF ETX`, ok: buf.includes('\u0003'), out: buf }
}

const results = {}

// 0) STX/ETX 비대화형 (대화형 진입 전에 시험 — 4.5.4+만)
results.framed_version = await framed('version')
results.framed_unknown = await framed('nosuchcmd')
await sleep(300)

// 1) '#' 진입
buf = ''
sock.write('#')
results.enter = { ok: await untilPrompt(5000), out: buf }

// 2) 인수 없는 get (전체 설정 + 범위)
const tGet = Date.now()
results.get_all = { ...(await cmd('get', 60000)), ms: Date.now() - tGet }
results.get_one = await cmd('get motor_pwm_protocol')
results.get_profile = await cmd('get p_roll')

// 3) 오류 문구
results.set_bad_name = await cmd('set no_such_setting = 1')
results.set_out_of_range = await cmd('set p_roll = 999')
results.set_bad_enum = await cmd('set motor_pwm_protocol = DSHOT9999')
results.set_ok = await cmd('set craft_name = PROBE')
results.unknown_cmd = await cmd('nosuchcmd')

// 4) batch 중 오류 → save 거부되는가 (save noreboot: 4.5.4+, 4.5.3은 재부팅 → 연결 끊김)
results.batch_start = await cmd('batch start')
results.batch_err = await cmd('set p_roll = 999')
results.batch_save_with_error = await cmd('save noreboot', 8000)
results.after_save_get = await cmd('get craft_name')
results.batch_end = await cmd('batch end')

// 5) 오류 없는 save noreboot → 값 유지 확인
results.set_ok2 = await cmd('set craft_name = PROBE2')
results.save_noreboot = await cmd('save noreboot', 8000)
results.after_save2 = await cmd('get craft_name', 5000)

sock.destroy()
writeFileSync(outPath, JSON.stringify(results, null, 1))
console.log(`wrote ${outPath}`)
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(24), v.ok === false ? 'TIMEOUT/NO-PROMPT' : 'ok', String(v.out ?? '').split('\n').length, 'lines', v.ms ? `${v.ms}ms` : '')

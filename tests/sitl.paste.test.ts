// SITL 통합 테스트 (4단계 완료 기준: "내보낸 파일을 CLI 탭에 붙여 넣으면 오류 없이 적용됨") — 평소에는 건너뛴다.
// 실행: scripts/sitl/run-paste.ps1 (빈 eeprom SITL 을 띄우고 SITL_TAG 를 넣어 이 파일만 돌림)
// 변경분 파일을 사람이 CLI 탭에 붙여 넣듯 한 줄씩 보내고, 오류 없이 받아들여졌는지와 diff all 에 반영됐는지 본다.
// 루프백 TCP(SITL)에만 연결한다. 실제 기체(시리얼)에는 연결하지 않는다. save 는 보내지 않는다(쓰기 절차는 5단계).
import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { responseComplete } from '../src/main/serial/cliReader'
import { parseCli } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import { changesFileText } from '../src/shared/edit/commands'
import { valueOf } from '../src/shared/edit/session'
import { apply, loadSitl, mixedSteps } from './editMix'

const TAG = process.env.SITL_TAG
const TARGET = process.env.SITL_TARGET ?? 'tcp://127.0.0.1:5761'

async function connect(target: string) {
  const m = /^tcp:\/\/(127\.0\.0\.1|localhost):(\d+)$/.exec(target)
  if (!m) throw new Error('loopback only')
  const sock = new Socket()
  let buf = ''
  sock.on('data', (d) => (buf += d.toString('latin1').replace(/\r/g, '')))
  await new Promise<void>((res, rej) => sock.connect(Number(m[2]), m[1], res).once('error', rej))
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  async function untilPrompt(cmd: string, timeout: number) {
    // dump 중간의 "# master" 같은 주석 줄에서 끊긴 조각을 프롬프트로 오인하지 않게, 잠시 조용해야 끝으로 본다
    const t0 = Date.now()
    let last = -1
    let still = 0
    while (Date.now() - t0 < timeout) {
      await sleep(30)
      if (buf.length !== last) {
        last = buf.length
        still = 0
      } else still += 30
      if (responseComplete(cmd, buf) && still >= 150) return
    }
    throw new Error(`timeout: ${buf.slice(-200)}`)
  }
  return {
    async send(line: string, timeout = 3000) {
      buf = ''
      sock.write(line === '#' ? '#' : line + '\n')
      await untilPrompt(line, timeout)
      return buf
    },
    close: () => sock.destroy()
  }
}

describe.runIf(Boolean(TAG))(`SITL ${TAG}: 변경분 파일 붙여 넣기`, () => {
  it('모든 줄이 오류 없이 적용되고, dump all 에 편집 값이 나온다', async () => {
    const base: CraftSnapshot = loadSitl(TAG!)
    const edits = apply(base, mixedSteps(base)).edits
    const text = changesFileText(base, edits, 'test')
    const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#') && l !== 'save')

    const cli = await connect(TARGET)
    try {
      await cli.send('#')
      const errors: string[] = []
      for (const l of lines) {
        const out = await cli.send(l)
        if (/###ERROR/.test(out)) errors.push(`${l} → ${out.trim()}`)
      }
      expect(errors).toEqual([])

      // dump all 은 기본값까지 모두 나오므로 편집한 값을 빠짐없이 대조할 수 있다
      const now = parseCli(await cli.send('dump all', 30000))
      const nowSnap = { ...base, ...now, meta: base.meta } as unknown as CraftSnapshot
      const mismatch = Object.values(edits)
        .map((e) => [e.key, valueOf(nowSnap, e.key), e.after] as const)
        .filter(([, got, want]) => got !== want)
      expect(mismatch).toEqual([])
      expect(Object.keys(edits).length).toBeGreaterThan(40)
    } finally {
      cli.close()
    }
  }, 120_000)
})

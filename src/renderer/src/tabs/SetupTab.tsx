import { Columns, Field, MasterField, Panel, TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

function formatReadAt(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'medium' })
}

const lineCount = (t: string) => (t.trim() ? t.trim().split('\n').length : 0)

export function SetupTab() {
  const { snap } = useSnap()
  const { meta, status } = snap
  const pidName = snap.pidProfiles[meta.activePidProfile]?.profile_name
  const rateName = snap.rateProfiles[meta.activeRateProfile]?.rateprofile_name
  const named = (n: number, name?: string) => `${n + 1}${name && name !== '-' ? ` (${name})` : ''}`

  return (
    <TabFrame title="설정" en="Setup">
      <Columns>
        <Panel title="기체 정보">
          <Field label="기체 이름" value={snap.craftName} hint="저장 파일 이름" />
          <MasterField name="craft_name" label="FC 기체 이름" />
          <MasterField name="pilot_name" label="파일럿 이름" />
          <Field label="펌웨어" value={meta.firmware} />
          <Field label="타깃" value={meta.target ? `${meta.target}${meta.targetShort ? ` (${meta.targetShort})` : ''}` : ''} />
          <Field label="보드" value={meta.board} />
          <Field label="제조사 ID" value={meta.manufacturerId} />
          <Field label="빌드" value={meta.buildDate} />
          <Field label="MSP API" value={meta.mspApi} />
        </Panel>

        <Panel title="상태" right={status ? undefined : 'status 없음'}>
          <Field label="활성 PID 프로필" value={named(meta.activePidProfile, pidName)} />
          <Field label="활성 레이트 프로필" value={named(meta.activeRateProfile, rateName)} />
          <Field label="MCU" value={status?.mcu} />
          {Object.entries(status?.sensors ?? {}).map(([k, v]) => (
            <Field key={k} label={`센서 · ${k}`} value={v} />
          ))}
          <Field label="자이로 주기" value={status?.gyroRate} unit="Hz" />
          <Field label="CPU 부하" value={status?.cpuLoad} unit="%" />
          <Field label="OSD" value={status?.osd} />
          <Field
            label="아밍 금지 사유"
            value={status?.armingDisableFlags.length ? status.armingDisableFlags.join(' ') : undefined}
            hint="읽는 동안의 상태 (CLI·USB 연결 중이라 정상)"
          />
        </Panel>

        <Panel title="가속도계 보정">
          <MasterField name="acc_trim_roll" label="롤 트림" />
          <MasterField name="acc_trim_pitch" label="피치 트림" />
          <MasterField name="acc_calibration" label="보정값" />
        </Panel>

        <Panel title="읽기 정보">
          <Field label="읽은 시각" value={formatReadAt(snap.readAt)} />
          <Field
            label="수신 줄 수"
            value={`dump ${lineCount(snap.raw.dumpAll)} · diff ${lineCount(snap.raw.diffAll)}`}
          />
          <Field label="설정 값" value={`${Object.keys(snap.master).length}개`} hint="master set 키" />
          <Field label="변경된 항목" value={`${snap.changed.length}개`} hint="diff all 기준, 노란 점으로 표시" />
          <Field label="해석 못 한 줄" value={`${snap.unknown.length}개`} hint="기타 탭에서 확인" />
        </Panel>
      </Columns>
    </TabFrame>
  )
}

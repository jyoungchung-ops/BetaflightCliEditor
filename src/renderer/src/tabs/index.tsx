import type { ComponentType } from 'react'
import type { TabId } from '@shared/tabs'
import { SetupTab } from './SetupTab'
import { PortsTab } from './PortsTab'
import { ConfigurationTab } from './ConfigurationTab'
import { PowerTab } from './PowerTab'
import { FailsafeTab } from './FailsafeTab'
import { PidTab } from './PidTab'
import { ReceiverTab } from './ReceiverTab'
import { ModesTab } from './ModesTab'
import { AdjustmentsTab } from './AdjustmentsTab'
import { ServosTab } from './ServosTab'
import { MotorsTab } from './MotorsTab'
import { OsdTab } from './OsdTab'
import { VtxTab } from './VtxTab'
import { LedTab } from './LedTab'
import { BlackboxTab } from './BlackboxTab'
import { GpsTab } from './GpsTab'
import { CliTab } from './CliTab'
import { OtherTab } from './OtherTab'

export const TAB_VIEWS: Record<TabId, ComponentType> = {
  setup: SetupTab,
  ports: PortsTab,
  configuration: ConfigurationTab,
  power: PowerTab,
  failsafe: FailsafeTab,
  pid: PidTab,
  receiver: ReceiverTab,
  modes: ModesTab,
  adjustments: AdjustmentsTab,
  servos: ServosTab,
  motors: MotorsTab,
  osd: OsdTab,
  vtx: VtxTab,
  led: LedTab,
  blackbox: BlackboxTab,
  gps: GpsTab,
  cli: CliTab,
  other: OtherTab
}

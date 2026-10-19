import {
  BatteryMedium,
  Cable,
  Database,
  Fan,
  Gauge,
  Lightbulb,
  List,
  MonitorPlay,
  Radio,
  RadioTower,
  Satellite,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  ToggleRight,
  Wrench,
  Cog,
  type LucideIcon
} from 'lucide-react'
import type { TabId } from '@shared/tabs'

const ICONS: Record<TabId, LucideIcon> = {
  setup: Wrench,
  ports: Cable,
  configuration: Settings,
  power: BatteryMedium,
  failsafe: ShieldAlert,
  pid: SlidersHorizontal,
  receiver: Radio,
  modes: ToggleRight,
  adjustments: Gauge,
  servos: Cog,
  motors: Fan,
  osd: MonitorPlay,
  vtx: RadioTower,
  led: Lightbulb,
  blackbox: Database,
  gps: Satellite,
  cli: Terminal,
  other: List
}

export function TabIcon({ id, size = 18 }: { id: TabId; size?: number }) {
  const Icon = ICONS[id]
  return <Icon size={size} strokeWidth={1.75} aria-hidden />
}

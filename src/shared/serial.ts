// 시리얼 읽기 관련 공용 타입 (메인 ↔ 렌더러)

export interface PortInfo {
  path: string
  /** 드롭다운 표시용 */
  label: string
  manufacturer?: string
  vendorId?: string
  productId?: string
  /** STM32 VCP(0483) / AT32(2E3C) */
  likelyFc: boolean
}

export type CliErrorCode =
  | 'PORT_BUSY'
  | 'PORT_NOT_FOUND'
  | 'PORT_OPEN_FAILED'
  | 'CLI_ENTER_FAILED'
  | 'TIMEOUT'
  | 'DISCONNECTED'
  | 'NOT_ALLOWED'
  | 'NOT_CONNECTED'
  | 'SESSION_BUSY'

export const CLI_ERROR_MESSAGES: Record<CliErrorCode, string> = {
  PORT_BUSY: '다른 프로그램이 포트를 사용 중입니다. Betaflight App 등 COM 포트를 연 프로그램을 닫고 다시 시도하세요.',
  PORT_NOT_FOUND: '포트를 찾을 수 없습니다. USB 연결을 확인하고 새로고침하세요.',
  PORT_OPEN_FAILED: '포트를 열 수 없습니다. USB 케이블과 드라이버를 확인하세요.',
  CLI_ENTER_FAILED: 'CLI 모드로 들어가지 못했습니다. 기체 USB를 뽑았다 다시 꽂은 뒤 다시 시도하세요.',
  TIMEOUT: '기체 응답이 시간 안에 오지 않았습니다. 기체 USB를 뽑았다 다시 꽂은 뒤 다시 시도하세요.',
  DISCONNECTED: '읽는 중에 USB 연결이 끊겼습니다. 받은 데이터는 버렸습니다. 다시 연결해 주세요.',
  NOT_ALLOWED: '허용되지 않은 명령입니다.',
  NOT_CONNECTED: '기체가 연결되어 있지 않습니다.',
  SESSION_BUSY: '이미 다른 읽기 작업이 진행 중입니다.'
}

/** 읽기 명령 순서 (SPEC 3절) */
/** 읽기 명령 순서 (SPEC 3절 + v2 9절: 마지막 'get'은 설정별 범위·허용값) */
export const READ_COMMANDS = ['version', 'status', 'diff all', 'dump all', 'get'] as const
export type ReadCommand = (typeof READ_COMMANDS)[number]

export interface ReadProgress {
  stage: 'opening' | 'entering' | 'command' | 'done'
  command?: string
  /** 0부터, READ_COMMANDS 기준 */
  index?: number
  total: number
  /** 현재 명령의 수신 줄 수 */
  lines: number
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; code: CliErrorCode; message: string }

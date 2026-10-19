// 사이드바 탭 목록. 순서는 SPEC 5절(Betaflight App 탭 순서)을 따른다.

export type TabId =
  | 'setup'
  | 'ports'
  | 'configuration'
  | 'power'
  | 'failsafe'
  | 'pid'
  | 'receiver'
  | 'modes'
  | 'adjustments'
  | 'servos'
  | 'motors'
  | 'osd'
  | 'vtx'
  | 'led'
  | 'blackbox'
  | 'gps'
  | 'cli'
  | 'other'

export interface TabDef {
  id: TabId
  label: string
  /** 영문 원래 이름 (Betaflight App 대응 탭) */
  en: string
  /** 화면에 들어갈 내용 요약 */
  summary: string
}

export const TABS: TabDef[] = [
  { id: 'setup', label: '설정', en: 'Setup', summary: '기체 정보 카드: 이름, 펌웨어, 타깃, 센서, 활성 프로필' },
  { id: 'ports', label: '포트', en: 'Ports', summary: 'UART별 MSP / Serial RX / 텔레메트리 / 센서 / 주변기기 설정' },
  { id: 'configuration', label: '구성', en: 'Configuration', summary: '시스템·ESC·보드 정렬·기능 토글' },
  { id: 'power', label: '전원·배터리', en: 'Power & Battery', summary: '배터리 전압·전류계 설정' },
  { id: 'failsafe', label: '페일세이프', en: 'Failsafe', summary: '단계 1·2 설정, 채널별 폴백 값' },
  { id: 'pid', label: 'PID 튜닝', en: 'PID Tuning', summary: 'PID 설정 / 레이트 / 필터' },
  { id: 'receiver', label: '수신기', en: 'Receiver', summary: '프로토콜, 채널 맵, RC 스무딩' },
  { id: 'modes', label: '모드', en: 'Modes', summary: 'AUX 채널별 모드 범위' },
  { id: 'adjustments', label: '조정', en: 'Adjustments', summary: '조정 범위와 기능' },
  { id: 'servos', label: '서보', en: 'Servos', summary: '서보 설정 (고정익만)' },
  { id: 'motors', label: '모터', en: 'Motors', summary: '믹서 그림과 모터 설정값' },
  { id: 'osd', label: 'OSD', en: 'OSD', summary: 'OSD 요소 목록과 미리보기 격자' },
  { id: 'vtx', label: '영상송신기', en: 'Video Transmitter', summary: '밴드 / 채널 / 출력' },
  { id: 'led', label: 'LED 스트립', en: 'LED Strip', summary: 'LED 격자와 색상' },
  { id: 'blackbox', label: '블랙박스', en: 'Blackbox', summary: '로깅 설정' },
  { id: 'gps', label: 'GPS', en: 'GPS', summary: 'GPS 공급자, SBAS, GPS 레스큐' },
  { id: 'cli', label: 'CLI', en: 'CLI', summary: 'diff all / dump all 원문, 검색, 복사' },
  { id: 'other', label: '기타', en: 'Other', summary: '탭 매핑에 없는 set 키와 해석 못 한 줄' }
]

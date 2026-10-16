// 画面に出す日本語の名前。データベースの値（英語）と対応させる

export const ROLE_LABELS = {
  admin: '管理者',
  captain: '主将',
  vice_captain: '副将',
  treasurer: '財務',
  equipment: '備品管理'
}
export const ROLE_ORDER = ['admin', 'captain', 'vice_captain', 'treasurer', 'equipment']

export const MAJOR_LABELS = { latin: 'ラテン', standard: 'スタンダード' }
export const POSITION_LABELS = { leader: 'リーダー', partner: 'パートナー' }
export const EVENT_KIND_LABELS = { practice: '練習', event: 'イベント' }

// 学年別に切り替えられる権限。増やすときはここに足す
export const GRADE_PERMISSIONS = [
  { key: 'schedule.edit', label: '予定の追加・編集' }
]

export const GRADES = [1, 2, 3, 4]

// 名前ごとに決まったパステル色（アイコンの背景用）
const PASTELS = ['#FFD9EA', '#D3F5E4', '#FFEDB0', '#DCEEFF', '#FFE0CF', '#E6DDFF']
export function pastelFor(text = '') {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return PASTELS[h % PASTELS.length]
}

// 年度は4月始まり（日本時間）。データベースの current_fiscal_year() と同じ計算
export function currentFiscalYear(date = new Date()) {
  const jst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.getMonth() >= 3 ? jst.getFullYear() : jst.getFullYear() - 1
}

// 5年目以上は4年生として扱う（データベースの grade_of() と同じ）
export function gradeOf(joinYear) {
  return Math.min(currentFiscalYear() - joinYear + 1, 4)
}

export function targetLabel(grades) {
  if (!grades || grades.length === 0) return null
  const sorted = [...grades].sort()
  if (sorted.length > 1 && sorted.every((g, i) => i === 0 || g === sorted[i - 1] + 1) && sorted.at(-1) === 4) {
    return `${sorted[0]}年以上`
  }
  return sorted.map((g) => `${g}年`).join('・')
}

export const BILL_KIND_LABELS = { dues: '部費', competition: '大会', camp_event: '合宿・イベント' }
export const ITEM_STATUS = {
  unpaid: { label: '未納', chip: 'red' },
  pending: { label: '確認待ち', chip: 'orange' },
  paid: { label: '支払い済み', chip: 'green' },
  waived: { label: '免除', chip: '' }
}
export const METHOD_LABELS = { transfer: '振込', cash: '現金' }
export const COMPETITION_STATUS = {
  recruiting: { label: '募集中', chip: 'primary' },
  confirmed: { label: '募集締切', chip: 'orange' },
  finished: { label: '終了', chip: '' }
}
export const ENTRY_STATUS = {
  requested: { label: 'エントリー済み', chip: 'green' },
  confirmed: { label: '出場確定', chip: 'green' },
  withdrawn: { label: '見送り', chip: '' }
}
export const DANCES = {
  latin: ['サンバ', 'チャチャチャ', 'ルンバ', 'パソドブレ', 'ジャイブ'],
  standard: ['ワルツ', 'タンゴ', 'スロー', 'クイック', 'ヴェニーズ']
}
export const EQUIPMENT_STATUS = { available: '貸出可', dress_rental: 'ドレスレンタル中', repair: '修理中', disposed: '廃棄' }

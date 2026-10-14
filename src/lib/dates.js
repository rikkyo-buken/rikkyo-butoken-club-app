// 日付の計算と表示（端末の時刻＝日本時間を前提）
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// 月曜始まりの週の初日
export function startOfWeek(d) {
  const x = startOfDay(d)
  const diff = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - diff)
  return x
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function fmtDate(d) {
  const x = new Date(d)
  return `${x.getMonth() + 1}/${x.getDate()}（${WEEKDAYS[x.getDay()]}）`
}

export function fmtTime(d) {
  const x = new Date(d)
  return `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`
}

// <input type="date"> と <input type="time"> 用
export function toDateInput(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export function toTimeInput(d) {
  const x = new Date(d)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
export function fromInputs(date, time) {
  return new Date(`${date}T${time}:00`)
}

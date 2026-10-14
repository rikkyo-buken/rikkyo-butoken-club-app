// 金額やファイルの小さな道具

export function yen(n) {
  return `¥${Number(n || 0).toLocaleString('ja-JP')}`
}

// CSVを作ってダウンロードする。Excelで文字化けしないよう先頭にBOMを付ける
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 写真を長辺 maxSize px の JPEG に縮める（保存容量を節約するため）
export async function compressImage(file, maxSize = 1200, quality = 0.8) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export function todayInput(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtYmd(s) {
  if (!s) return ''
  const [, m, d] = s.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}`
}

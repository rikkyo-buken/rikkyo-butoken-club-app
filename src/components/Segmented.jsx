// 画面内の表示切り替え（例：自分の支払い / 会計）
export default function Segmented({ items, value, onChange }) {
  if (items.length < 2) return null
  return (
    <div className="segmented" role="tablist">
      {items.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  )
}

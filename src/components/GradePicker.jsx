import { GRADES } from '../lib/constants'

// 対象学年を選ぶ。何も選ばなければ「全員」
export default function GradePicker({ value, onChange }) {
  const selected = value ?? []
  const toggle = (g) => onChange(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g].sort())
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <span>対象学年（選ばなければ全員）</span>
      <div className="choice-row">
        <button type="button" className="choice" aria-pressed={selected.length === 0} onClick={() => onChange([])}>全員</button>
        {GRADES.map((g) => (
          <button type="button" key={g} className="choice" aria-pressed={selected.includes(g)} onClick={() => toggle(g)}>{g}年</button>
        ))}
      </div>
    </fieldset>
  )
}

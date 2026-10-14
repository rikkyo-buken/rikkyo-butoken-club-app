import { useEffect } from 'react'

// 画面の下から出てくる入力パネル
export default function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="sheet-title grow">{title}</h2>
          <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  )
}

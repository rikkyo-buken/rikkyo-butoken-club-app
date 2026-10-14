import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { configMissing } from './lib/supabase'
import { SessionProvider } from './lib/session'
import App from './App'
import './styles.css'

// 画面が真っ白にならないよう、問題があれば内容を表示する
function Problem({ title, detail }) {
  return (
    <div className="center-screen">
      <h1 className="page-title">{title}</h1>
      <div className="notice error" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detail}</div>
      <p className="sub">この画面を管理者に送ってください。</p>
    </div>
  )
}

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return <Problem title="表示中にエラーが起きました" detail={String(this.state.error?.message || this.state.error)} />
    return this.props.children
  }
}

const root = createRoot(document.getElementById('root'))

if (configMissing) {
  root.render(
    <Problem title="接続設定が読み込まれていません"
      detail={'Netlify の Environment variables に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を登録してから、Deploys → Trigger deploy で公開し直してください。'} />
  )
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  )
}

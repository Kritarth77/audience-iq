import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import InfluenceGraph from './components/InfluenceGraph'
import { fetchAnalytics, syncLiveData } from './api/analytics'
import './styles.css'

const nav = [
  ['overview', '⌁', 'Overview'], ['audience', '◉', 'Audience'], ['content', '▣', 'Content'], ['campaigns', '◈', 'Campaigns'], ['reports', '▤', 'Reports']
]
function Icon({children}) { return <span className="icon">{children}</span> }
function Metric({icon, label, value, delta, tone='teal'}) {
  return <div className="metric glass"><div className={`metric-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><small className={delta?.startsWith('-') ? 'negative' : ''}>{delta} <span>vs last month</span></small></div></div>
}
function getPaddedMonthlyData(timeRange, monthlyTrends) {
  const source = Array.isArray(monthlyTrends) ? monthlyTrends : []
  const normalized = source
    .map(point => {
      const month = String(point.month || point.m || '')
      const match = /^(\d{4})-(\d{1,2})/.exec(month)
      if (!match) return null
      return {
        month: `${match[1]}-${match[2].padStart(2, '0')}`,
        reach: Number(point.reach) || 0,
        engagements: Number(point.engagements) || 0
      }
    })
    .filter(Boolean)
  const latestMonth = normalized.reduce((latest, point) => point.month > latest ? point.month : latest, '') ||
    new Date().toISOString().slice(0, 7)
  const pointCount = { '7D': 2, '30D': 2, '90D': 3, '1Y': 12 }[timeRange] || 2
  const latestDate = new Date(`${latestMonth}-01T00:00:00Z`)
  const valuesByMonth = new Map(normalized.map(point => [point.month, point]))

  return Array.from({length: pointCount}, (_, index) => {
    const date = new Date(Date.UTC(
      latestDate.getUTCFullYear(),
      latestDate.getUTCMonth() - pointCount + index + 1,
      1
    ))
    const month = date.toISOString().slice(0, 7)
    const point = valuesByMonth.get(month)
    return {
      m: month,
      reach: point?.reach || 0,
      engagements: point?.engagements || 0,
      clicks: 0
    }
  })
}
function AreaChart({range, monthly}) {
  const data = getPaddedMonthlyData(range, monthly)
  const [hover, setHover] = useState(null)

  if (data.length < 2) {
    return <div className="chart-wrap chart-empty">Not enough historical data to display trend</div>
  }

  const maxValue = Math.max(
    ...data.flatMap(point => [Number(point.reach) || 0, Number(point.engagements) || 0]),
    1
  )
  const chartHeight = 150
  const yForValue = value => 190 - ((Number(value) || 0) / maxValue) * chartHeight
  const points = key => data.map((d, i) => `${32 + i * (676 / (data.length - 1))},${yForValue(d[key])}`).join(' ')
  return <div className="chart-wrap">
    <svg viewBox="0 0 740 220" className="area-chart" onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id="reach" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4fd1c5" stopOpacity=".34"/><stop offset="1" stopColor="#4fd1c5" stopOpacity="0"/></linearGradient><linearGradient id="engage" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b678f0" stopOpacity=".22"/><stop offset="1" stopColor="#b678f0" stopOpacity="0"/></linearGradient></defs>
      {[40,90,140,190].map(y=><line key={y} x1="32" x2="708" y1={y} y2={y} className="gridline"/>)}
      <polygon points={`32,190 ${points('reach')} 708,190`} fill="url(#reach)"/><polygon points={`32,190 ${points('engagements')} 708,190`} fill="url(#engage)"/>
      <polyline points={points('reach')} className="line reach"/><polyline points={points('engagements')} className="line engage"/>
      {data.map((d,i)=> <circle key={d.m} cx={32+i*(676/(data.length-1))} cy={yForValue(d.reach)} r="5" className="point" onMouseEnter={()=>setHover({d,i})}/>)}
      {data.map((d,i)=><text key={d.m} x={32+i*(676/(data.length-1))} y="215" textAnchor="middle">{d.m}</text>)}
    </svg>
    {hover && <div className="chart-tooltip" style={{left:`${10 + hover.i/(data.length-1)*82}%`}}><b>{hover.d.m} 2024</b><span>Reach <strong>{hover.d.reach}</strong></span><span>Engagement <strong>{hover.d.engagements}</strong></span><span>Clicks <strong>{hover.d.clicks}</strong></span></div>}
  </div>
}
function Donut({sentiment}) {
  const positive = sentiment?.positive?.percentage ?? 52
  const neutral = sentiment?.neutral?.percentage ?? 17
  const negative = sentiment?.negative?.percentage ?? 31
  return <div className="donut-box"><div className="donut"><div><b>{positive.toFixed(1)}%</b><span>Positive sentiment</span></div></div><div className="legend">{[['Positive','#5eead4',positive],['Negative','#c084fc',negative],['Neutral','#f6c86e',neutral]].map(x=><div key={x[0]}><i style={{background:x[1]}}/>{x[0]}<b>{x[2].toFixed(1)}%</b></div>)}</div></div>
}
function App() {
  const [active, setActive] = useState('overview'), [range, setRange] = useState('30D'), [search, setSearch] = useState(''), [menu, setMenu] = useState(false), [toast, setToast] = useState('')
  const [overview, setOverview] = useState(null), [isSyncing, setIsSyncing] = useState(false), [syncStage, setSyncStage] = useState(''), [syncKeyword, setSyncKeyword] = useState('')
  const title = nav.find(n=>n[0]===active)?.[2] || 'Overview'
  const topPosts = overview?.top_posts || []
  const filteredPosts = topPosts.filter(post => post.text.toLowerCase().includes(search.toLowerCase()))
  const notify = text => { setToast(text); setTimeout(()=>setToast(''), 2600) }
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()
  const refreshOverview = async () => {
    const data = await fetchAnalytics()
    if (data) {
      console.log('Fetched backend data:', data)
      setOverview(data)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    const loadOverview = () => fetchAnalytics(controller.signal)
      .then(data => {
        if (data) {
          console.log('Fetched backend data:', data)
          setOverview(data)
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') console.error('Failed to fetch backend data:', error)
      })
    loadOverview()
    const poller = setInterval(loadOverview, 15000)
    return () => {
      clearInterval(poller)
      controller.abort()
    }
  }, [])
  const handleSyncLiveData = async () => {
    if (isSyncing) return
    setIsSyncing(true)
    const stages = ['Authenticating APIs...', 'Fetching Reddit Data...', 'Running AI Sentiment Engine...', 'Refreshing Dashboard...']
    let stageIndex = 0
    setSyncStage(stages[stageIndex])
    const stageTimer = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, stages.length - 1)
      setSyncStage(stages[stageIndex])
    }, 1200)
    try {
      await syncLiveData(syncKeyword)
      await refreshOverview()
      setSyncKeyword('')
      notify('Live data synced successfully')
    } catch (error) {
      console.error('Failed to sync live data:', error)
      notify(error instanceof Error ? error.message : 'Live data sync failed')
    } finally {
      clearInterval(stageTimer)
      setIsSyncing(false)
      setSyncStage('')
    }
  }
  const metrics = overview?.metrics
  const formatValue = value => typeof value === 'number' ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value) : value
  const liveMonthly = overview?.monthly_trends || overview?.performance || []
  const liveDemographics = overview?.demographics || []
  return <div className="app">
    <aside className="sidebar">
      <div className="brand" role="button" tabIndex="0" onClick={()=>window.location.reload()} onKeyDown={event=>event.key==='Enter'&&window.location.reload()} style={{cursor:'pointer'}}><div className="brand-mark">✦</div><div><b>Audience<span>IQ</span></b><small>Social intelligence</small></div></div>
      <div className="workspace"><div className="avatar">AC</div><div><b>Acme Creative</b><small>Business workspace</small></div><button onClick={()=>setMenu(!menu)}>⌄</button>{menu&&<div className="workspace-menu"><span>Acme Creative</span><span>Switch workspace</span><span>Workspace settings</span></div>}</div>
      <nav>{nav.map(([id,ico,label])=><button className={active===id?'active':''} key={id} onClick={()=>id==='overview' ? setActive('overview') : notify('Pro Feature - Coming Soon')}><Icon>{ico}</Icon>{label}{id==='reports'&&<em>3</em>}</button>)}</nav>
      <div className="sidebar-bottom"><button onClick={()=>notify('Help center opened')}><Icon>?</Icon>Help center</button><button onClick={()=>notify('Settings opened')}><Icon>⚙</Icon>Settings</button><div className="profile"><div className="avatar warm">JD</div><span><b>Jordan Davis</b><small>Admin</small></span><span>•••</span></div></div>
    </aside>
    <main>
      <header><div className="mobile-brand">✦ <b>Audience<span>IQ</span></b></div><div className="crumb">Workspace <span>/</span> {title}</div><div className="header-actions"><div className="search"><Icon>⌕</Icon><input placeholder="Search anything..." value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><input value={syncKeyword} onChange={event=>setSyncKeyword(event.target.value)} placeholder="Track a brand..." aria-label="Brand keyword to track" disabled={isSyncing} style={{width:'145px',height:'35px',padding:'0 10px',border:'1px solid #29443e',borderRadius:'8px',background:'rgba(16,33,31,.85)',color:'#e3f2ef',outline:'none',fontSize:'11px'}}/><button className="round" onClick={()=>notify('No new notifications')}>♢<i/></button><button className="round" onClick={()=>notify('Theme preference saved')}>◐</button><button className="new-btn" onClick={handleSyncLiveData} disabled={isSyncing}>{isSyncing ? `◌ ${syncStage}` : '↻ Sync live data'}</button><button className="new-btn" onClick={()=>window.print()}>＋ Create report</button></div></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">{currentDate}</p><h1>{greeting}, Admin <span>✦</span></h1><p className="sub">Here’s what’s happening with your audience today.</p></div><div className="date-picker"><span>◷</span> Last 30 days <b>⌄</b></div></div>
      {active !== 'overview' ? <section className="placeholder glass"><div className="empty-orb">✦</div><h2>{title} insights</h2><p>Your {title.toLowerCase()} workspace is ready. Select a report or return to Overview to explore live audience performance.</p><button className="primary" onClick={()=>setActive('overview')}>Back to overview</button></section> : <>
        <section className="metrics">{[['◉','Total reach',formatValue(metrics?.total_reach?.value ?? '8.6M'),'+18.2%','teal'],['◎','Engagements',formatValue(metrics?.total_engagements?.value ?? '1.24M'),'+12.8%','purple'],['♧','Total Posts',formatValue(metrics?.total_posts?.value ?? 0),'+6.4%','gold'],['↗','Engagement rate',`${metrics?.engagement_rate?.value ?? '6.82'}%`,'-0.6%','pink']].map(x=><Metric key={x[1]} icon={x[0]} label={x[1]} value={x[2]} delta={x[3]} tone={x[4]}/>)}</section>
        <section className="grid-main"><div className="panel glass performance"><div className="panel-head"><div><h2>Performance overview</h2><p>Track your key audience metrics over time</p></div><div className="tabs">{['7D','30D','90D','1Y'].map(x=><button className={range===x?'selected':''} onClick={()=>setRange(x)} key={x}>{x}</button>)}</div></div><div className="chart-key"><span><i className="teal-bg"/>Reach</span><span><i className="purple-bg"/>Engagement</span></div><AreaChart range={range} monthly={liveMonthly}/></div><div className="panel glass sentiment"><div className="panel-head"><div><h2>Overall Brand Sentiment</h2><p>How people feel about your brand mentions</p></div><button className="more" onClick={()=>notify('Sentiment details opened')}>•••</button></div><Donut sentiment={overview?.sentiment}/><div className="sentiment-foot"><span>Positive sentiment</span><b>{(overview?.sentiment?.positive?.percentage ?? 82.4).toFixed(1)}%</b><div className="progress"><i/></div></div></div></section>
        <section className="panel glass influence-panel"><div className="panel-head"><div><h2>Influence network</h2><p>Explore how brand mentions move through the community</p></div><button className="link" onClick={()=>notify('Network exploration enabled')}>Explore network <span>→</span></button></div><InfluenceGraph network={overview?.network}/></section>
        <section className="grid-bottom"><div className="panel glass top-content"><div className="panel-head"><div><h2>Trending Brand Mentions</h2><p>Your most discussed brand posts</p></div><button className="link" onClick={()=>notify('Pro Feature - Coming Soon')}>View all <span>→</span></button></div><div className="post-list">{filteredPosts.map((post,i)=>{const title = post.text.length > 48 ? `${post.text.slice(0, 48)}…` : post.text; return <div className="post" key={`${post.text}-${i}`}><div className={`post-thumb t${i}`} style={{background:i % 2 ? '#8f2f24' : '#d94f27',color:'#ffe0d2'}}>r/</div><div className="post-title"><b>{title}</b><small>Reddit · Live data</small></div><div className="post-stat"><b>{formatValue(post.reach)}</b><small>Reach</small></div><div className="post-stat"><b>{post.engagement_rate}%</b><small>Rate</small></div><button className="post-more" onClick={()=>notify(`${title} selected`)}>↗</button></div>})}</div></div><div className="panel glass demographics"><div className="panel-head"><div><h2>Audience demographics</h2><p>Age distribution</p></div><button className="more">•••</button></div><div className="bars">{liveDemographics.map(a=><div className="bar-row" key={a.label}><span>{a.label}</span><div><i style={{width:`${a.percentage}%`,background:'#5eead4'}}/></div><b>{a.percentage}%</b></div>)}</div><button className="outline" onClick={()=>notify('Pro Feature - Coming Soon')}>Explore audience <span>→</span></button></div></section>
      </>}</div>
    </main>{toast&&<div className="toast">✓ {toast}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App />)

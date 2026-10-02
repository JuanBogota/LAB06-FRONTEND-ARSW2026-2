import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { list } from './lib/blueprintsApi.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080' // Spring
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE ?? API_BASE
const BP_URL = `${API_BASE}/api/v1/blueprints`

export default function App() {
  const [tech, setTech] = useState('stomp')
  const [authorInput, setAuthorInput] = useState('juan')
  const [nameInput, setNameInput] = useState('plano-1')
  const [author, setAuthor] = useState('juan')
  const [name, setName] = useState('plano-1')

  useEffect(() => {
    const t = setTimeout(() => {
      setAuthor(authorInput.trim())
      setName(nameInput.trim())
    }, 400)
    return () => clearTimeout(t)
  }, [authorInput, nameInput])

  const canvasRef = useRef(null)
  const [points, setPoints] = useState([])

  const [blueprints, setBlueprints] = useState([])   // lo guardado en el servidor
  const [listError, setListError] = useState(null)

  const stompRef = useRef(null)
  const unsubRef = useRef(null)


  useEffect(() => {
    if (!author || !name) { setPoints([]); return }
    const ctrl = new AbortController()
    setPoints([])
    fetch(`${BP_URL}/${author}/${name}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(res => setPoints(res?.data?.points ?? []))
      .catch(err => { if (err.name !== 'AbortError') console.error('Error cargando el plano', err) })
    return () => ctrl.abort()                        
  }, [author, name, tech])

  useEffect(() => {
    if (!author) { setBlueprints([]); setListError(null); return }
    const ctrl = new AbortController()
    setListError(null)
    list(author, { signal: ctrl.signal })
      .then(setBlueprints)
      .catch(err => {
        if (err.name === 'AbortError') return
        setBlueprints([])
        setListError(err.message)
      })
    return () => ctrl.abort()
  }, [author])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 600, 400)
    if (points.length === 0) return
    ctx.beginPath()
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    points.forEach(p => ctx.fillRect(p.x - 2, p.y - 2, 4, 4))
  }, [points])

  useEffect(() => {
    unsubRef.current?.unsubscribe?.(); unsubRef.current = null
    stompRef.current?.deactivate?.(); stompRef.current = null
    if (!author || !name) return

    if (tech === 'stomp') {
      const client = createStompClient(STOMP_BASE)
      stompRef.current = client
      client.onConnect = () => {
        unsubRef.current = subscribeBlueprint(client, author, name, (upd) => {
          setPoints(prev => [...prev, ...upd.points])
        })
      }
      client.activate()
    }
    return () => {
      unsubRef.current?.unsubscribe?.(); unsubRef.current = null
      stompRef.current?.deactivate?.()
    }
  }, [tech, author, name])

  function onClick(e) {
    const rect = e.target.getBoundingClientRect()
    const point = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) }

    if (tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({ destination: '/app/draw', body: JSON.stringify({ author, name, point }) })
    } else {
      setPoints(prev => [...prev, point])   // sin tiempo real (None): dibujo local
    }
  }
  const sortedBlueprints = [...blueprints].sort((a, b) => a.name.localeCompare(b.name))
  const totalPoints = blueprints.reduce((sum, bp) => sum + bp.points.length, 0)

  function selectBlueprint(bpName) {
    setNameInput(bpName)
    setName(bpName)   // sin esperar los 400 ms del debounce
  }
  return (
    <div style={{fontFamily:'Inter, system-ui', padding:16, maxWidth:900}}>
      <h2>BluePrints RT – STOMP</h2>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        <label>Tecnología:</label>
        <select value={tech} onChange={e=>setTech(e.target.value)}>
          <option value="none">None (solo local)</option>
          <option value="stomp">STOMP (Spring)</option>
        </select>
        <input value={authorInput} onChange={e=>setAuthorInput(e.target.value)} placeholder="autor"/>
        <input value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="plano"/>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{border:'1px solid #ddd', borderRadius:12}}
        onClick={onClick}
      />
      <p style={{opacity:.7, marginTop:8}}>Tip: abre 2 pestañas y dibuja alternando para ver la colaboración.</p>
          <h3 style={{marginTop:16}}>Planos de {author || '…'}</h3>
          {listError && <p role="alert" style={{color:'#b00020'}}>{listError}</p>}
          <table style={{borderCollapse:'collapse', width:'100%', maxWidth:600}}>
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Plano</th>
                <th style={{textAlign:'right'}}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {sortedBlueprints.map(bp => {
                const selected = bp.name === name
                const unsaved = selected && points.length !== bp.points.length
                return (
                  <tr
                    key={bp.name}
                    onClick={() => selectBlueprint(bp.name)}
                    style={{cursor:'pointer', background: selected ? '#eef4ff' : 'transparent'}}
                  >
                    <td>{bp.name}{unsaved && <em style={{opacity:.6}}> (sin guardar)</em>}</td>
                    <td style={{textAlign:'right'}}>{bp.points.length}</td>
                  </tr>
                )
              })}
              {blueprints.length === 0 && !listError && (
                <tr><td colSpan={2} style={{opacity:.6}}>Este autor no tiene planos</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td style={{textAlign:'right'}}><strong>{totalPoints}</strong></td>
              </tr>
            </tfoot>
          </table>
    </div>
  )
}

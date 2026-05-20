import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, MapPin, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useStore, type CalendarEvent } from '../store'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SEVEN_COL_GRID = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }
const MONTH_GRID = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('ms-MY', { hour: 'numeric', minute: '2-digit' })
}

function monthTitle(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function compactMonthTitle(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long' })
}

function fullDate(d: Date) {
  return d.toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function dateInputValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60000)
}

export default function Calendar() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const store = useStore()
  const events = store.calendarEvents
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => new Date())
  const [dayOpen, setDayOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [eventDetail, setEventDetail] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState({
    title: '',
    date: dateInputValue(new Date()),
    time: '09:00',
    location: '',
    description: '',
  })

  const refresh = async () => {
    setLoading(true)
    try {
      const fresh = await window.wa.getCalendarEvents()
      store.setCalendarEvents(fresh as CalendarEvent[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const update = () => setCompact(el.clientWidth < 1080)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cells = useMemo(() => {
    const first = startOfMonth(cursor)
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const miniCells = useMemo(() => {
    const first = startOfMonth(cursor)
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const e of events.filter(e => e.status !== 'cancelled')) {
      const k = dateKey(new Date(e.start_at))
      if (!map[k]) map[k] = []
      map[k].push(e)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    }
    return map
  }, [events])

  const selectedEvents = eventMap[dateKey(selected)] || []
  const autoAiCount = events.filter(e => e.source === 'ai_booking' && e.status !== 'cancelled').length
  const monthEventCount = events.filter(e => {
    const d = new Date(e.start_at)
    return e.status !== 'cancelled' && d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()
  }).length

  const prevMonth = () => setCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => {
    const today = new Date()
    setCursor(startOfMonth(today))
    setSelected(today)
    setDayOpen(false)
  }

  const removeEvent = async (id?: string) => {
    if (!id) return
    await window.wa.deleteCalendarEvent(id)
    store.setCalendarEvents(events.filter(e => e.id !== id))
  }

  const openCreate = (day = selected) => {
    setForm({
      title: '',
      date: dateInputValue(day),
      time: '09:00',
      location: '',
      description: '',
    })
    setCreateOpen(true)
  }

  const openDay = (day: Date) => {
    setSelected(day)
    setDayOpen(false)
  }

  const saveManualEvent = async () => {
    const title = form.title.trim()
    if (!title) return
    const start = new Date(`${form.date}T${form.time || '09:00'}:00`)
    const id = await window.wa.saveCalendarEvent({
      contact_id: '',
      conversation_id: '',
      title,
      description: form.description.trim(),
      location: form.location.trim(),
      start_at: start.toISOString(),
      end_at: addMinutes(start, 60).toISOString(),
      status: 'scheduled',
      source: 'manual',
    })
    const fresh = await window.wa.getCalendarEvents()
    store.setCalendarEvents(fresh as CalendarEvent[])
    const savedDay = new Date(start)
    setSelected(savedDay)
    setCursor(startOfMonth(savedDay))
    setCreateOpen(false)
    setDayOpen(false)
    return id
  }

  return (
    <div ref={rootRef} className="h-full overflow-hidden bg-bg-primary text-text-primary flex flex-col relative">
      <header className={`shrink-0 border-b border-border bg-bg-primary flex items-center gap-3 ${compact ? 'h-auto min-h-16 flex-wrap px-4 py-3' : 'h-16 px-5 gap-4'}`}>
        <div className={`flex items-center gap-3 ${compact ? 'min-w-0 flex-1' : 'min-w-[220px]'}`}>
          <div className="w-9 h-9 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
            <CalendarDays size={19} className="text-accent-blue" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Calendar</h1>
            <p className="text-[11px] text-text-muted">SYNCERA booking</p>
          </div>
        </div>

        <button onClick={goToday} className="h-9 px-4 rounded-full border border-border bg-bg-tertiary hover:bg-bg-hover text-sm font-semibold">
          Today
        </button>
        <div className="flex items-center">
          <button onClick={prevMonth} className="w-9 h-9 rounded-full hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary">
            <ChevronLeft size={18} />
          </button>
          <button onClick={nextMonth} className="w-9 h-9 rounded-full hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary">
            <ChevronRight size={18} />
          </button>
        </div>

        <h2 className={`${compact ? 'order-last w-full text-center text-lg' : 'text-xl'} font-semibold tracking-tight`}>{monthTitle(cursor)}</h2>

        <div className={`${compact ? '' : 'ml-auto'} flex items-center gap-2`}>
          <button onClick={refresh} className="w-9 h-9 rounded-full hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="h-9 px-3 rounded-lg border border-border bg-bg-tertiary hover:bg-bg-hover text-sm font-semibold flex items-center gap-2">
            Month <ChevronDown size={15} />
          </button>
        </div>
      </header>

      <div className={`${compact ? 'flex-1 min-h-0 overflow-y-auto' : 'flex-1 min-h-0 flex overflow-hidden'}`}>
        {compact && (
          <div className="p-3 border-b border-border bg-bg-secondary/35">
            <button onClick={() => openCreate(selected)} className="h-11 w-full px-5 rounded-xl bg-bg-primary border border-border hover:bg-bg-hover shadow-sm flex items-center justify-center gap-3 text-sm font-bold">
              <Plus size={18} className="text-accent-blue" />
              Create
            </button>
          </div>
        )}

        {!compact && <aside className="w-[260px] shrink-0 border-r border-border bg-bg-secondary/45 flex flex-col min-h-0">
          <div className="p-4 border-b border-border">
            <button onClick={() => openCreate(selected)} className="h-12 w-full px-5 rounded-2xl bg-bg-primary border border-border hover:bg-bg-hover shadow-sm flex items-center justify-center gap-3 text-sm font-bold">
              <Plus size={18} className="text-accent-blue" />
              Create
            </button>
          </div>

          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">{compactMonthTitle(cursor)} {cursor.getFullYear()}</p>
              <div className="flex">
                <button onClick={prevMonth} className="w-7 h-7 rounded-full hover:bg-bg-hover flex items-center justify-center text-text-muted">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={nextMonth} className="w-7 h-7 rounded-full hover:bg-bg-hover flex items-center justify-center text-text-muted">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="gap-1 text-center" style={SEVEN_COL_GRID}>
              {DAYS.map(d => (
                <div key={d} className="h-6 text-[10px] text-text-muted font-bold flex items-center justify-center">
                  {d[0]}
                </div>
              ))}
              {miniCells.map(day => {
                const inMonth = day.getMonth() === cursor.getMonth()
                const isToday = sameDay(day, new Date())
                const isSelected = sameDay(day, selected)
                return (
                  <button
                    key={dateKey(day)}
                    onClick={() => openDay(day)}
                    className={`h-7 rounded-full text-[11px] font-semibold flex items-center justify-center transition-all duration-150 ease-out active:scale-95 ${
                      isSelected
                        ? 'bg-accent-blue text-white'
                        : isToday
                          ? 'text-accent-blue border border-accent-blue/60'
                          : inMonth
                            ? 'text-text-primary hover:bg-bg-hover'
                            : 'text-text-muted/50 hover:bg-bg-hover/60'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <p className="text-xs uppercase tracking-wider text-text-muted font-bold mb-3">My calendars</p>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-4 h-4 rounded-sm bg-accent-blue" />
              <span className="flex-1">AI Booking</span>
              <span className="text-xs text-text-muted">{autoAiCount}</span>
            </label>
          </div>

          <div className="p-4 flex-1 min-h-0 overflow-y-auto">
            <p className="text-xs uppercase tracking-wider text-text-muted font-bold mb-3">Selected day</p>
            <p className="text-sm font-bold leading-snug">{fullDate(selected)}</p>
            <p className="text-xs text-text-muted mt-1">{selectedEvents.length} appointment</p>
            <div className="mt-4 space-y-2">
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-text-muted leading-relaxed">Tiada booking untuk tarikh ini.</p>
              ) : selectedEvents.map(e => (
                <button key={e.id} onClick={() => setEventDetail(e)} className="w-full text-left rounded-lg border border-border bg-bg-primary p-3 hover:bg-bg-hover transition-all duration-150 ease-out active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-snug">{e.title}</p>
                      <p className="text-[11px] text-accent-blue flex items-center gap-1 mt-1">
                        <Clock size={11} /> {timeLabel(e.start_at)}
                      </p>
                    </div>
                    <button onClick={(ev) => { ev.stopPropagation(); removeEvent(e.id) }} className="text-text-muted hover:text-status-danger">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {e.location && (
                    <p className="text-[11px] text-text-muted mt-2 flex items-start gap-1">
                      <MapPin size={11} className="mt-0.5 flex-shrink-0" />
                      <span>{e.location}</span>
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </aside>}

        {compact ? (
          <div className="min-h-[780px] border-t border-border bg-bg-primary" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 18%) minmax(0, 1fr)' }}>
            <section className="min-w-0 border-r border-border bg-bg-secondary/35 flex flex-col">
              <div className="px-3 py-3 border-b border-border flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Selected day memo</p>
                  <p className="text-sm font-black truncate">{fullDate(selected)}</p>
                  <p className="text-xs text-text-muted">{selectedEvents.length} memo / temu janji</p>
                </div>
                <button onClick={() => openCreate(selected)} className="h-8 w-full px-3 rounded-lg bg-accent-blue text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0">
                  <Plus size={13} /> Add
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {selectedEvents.length === 0 ? (
                  <p className="rounded-lg border border-border bg-bg-primary p-3 text-xs text-text-muted leading-relaxed">Tiada memo atau temu janji untuk tarikh ini.</p>
                ) : selectedEvents.map(e => (
                  <button key={e.id} onClick={() => setEventDetail(e)} className="w-full text-left rounded-lg border border-border bg-bg-primary p-3 hover:bg-bg-hover transition-all duration-150 ease-out active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-snug">{e.title}</p>
                        <p className="text-[11px] text-accent-blue flex items-center gap-1 mt-1">
                          <Clock size={11} /> {timeLabel(e.start_at)}
                        </p>
                      </div>
                      <button onClick={(ev) => { ev.stopPropagation(); removeEvent(e.id) }} className="text-text-muted hover:text-status-danger shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {e.location && <p className="text-[11px] text-text-muted mt-2 line-clamp-2">{e.location}</p>}
                    {e.description && <p className="text-[11px] text-text-secondary mt-2 line-clamp-3">{e.description}</p>}
                  </button>
                ))}
              </div>
            </section>

            <main className="min-w-0 flex flex-col bg-bg-primary">
              <div className="h-10 border-b border-border bg-border gap-px" style={SEVEN_COL_GRID}>
                {DAYS.map(d => (
                  <div key={d} className="flex items-center justify-center text-[11px] font-bold uppercase tracking-wide text-text-muted bg-bg-primary">
                    {d}
                  </div>
                ))}
              </div>

              <div className="flex-1 min-h-0 relative">
                {monthEventCount === 0 && (
                  <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-border bg-bg-secondary/90 px-3 py-1 text-xs text-text-muted">
                    No events scheduled this month
                  </div>
                )}
                <div className="absolute inset-0 bg-border gap-px" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, minmax(96px, 1fr))' }}>
                  {cells.map(day => {
                    const key = dateKey(day)
                    const dayEvents = eventMap[key] || []
                    const inMonth = day.getMonth() === cursor.getMonth()
                    const isToday = sameDay(day, new Date())
                    const isSelected = sameDay(day, selected)
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    return (
                      <button
                        key={key}
                        onClick={() => openDay(day)}
                        className={`text-left min-w-0 overflow-hidden p-3 transition-all duration-150 ease-out active:scale-[0.995] ${
                          isSelected ? 'bg-accent-blue/10' : 'hover:bg-bg-hover/55'
                        } bg-bg-primary ${inMonth ? '' : 'opacity-60'}`}
                      >
                        <div className="h-8 flex justify-start">
                          <span className={`min-w-8 h-8 px-2 rounded-full flex items-center justify-center text-sm font-bold ${
                            isToday
                              ? 'bg-accent-blue text-white'
                              : isSelected
                                ? 'bg-bg-hover text-text-primary border border-accent-blue/60'
                                : inMonth
                                  ? 'text-text-primary'
                                  : 'text-text-muted'
                          }`}>
                            {day.getDate()}
                          </span>
                        </div>

                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 3).map(e => (
                            <div key={e.id} className="h-[21px] rounded-md border border-accent-blue/25 bg-accent-blue/10 text-accent-blue text-[11px] leading-[21px] px-2 truncate">
                              <span className="font-bold">{timeLabel(e.start_at)}</span> {e.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[11px] text-text-secondary px-1">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </main>
          </div>
        ) : (
        <main className="flex-1 min-w-0 flex flex-col bg-bg-primary">
          <div className="h-10 border-b border-border bg-border gap-px" style={SEVEN_COL_GRID}>
            {DAYS.map(d => (
              <div key={d} className="flex items-center justify-center text-[11px] font-bold uppercase tracking-wide text-text-muted bg-bg-primary">
                {d}
              </div>
            ))}
          </div>

          <div className={`${compact ? 'h-[620px]' : 'flex-1 min-h-0'} relative`}>
            {monthEventCount === 0 && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-border bg-bg-secondary/90 px-3 py-1 text-xs text-text-muted">
                No events scheduled this month
              </div>
            )}
            <div className="absolute inset-0 bg-border gap-px" style={MONTH_GRID}>
            {cells.map(day => {
              const key = dateKey(day)
              const dayEvents = eventMap[key] || []
              const inMonth = day.getMonth() === cursor.getMonth()
              const isToday = sameDay(day, new Date())
              const isSelected = sameDay(day, selected)
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <button
                  key={key}
                  onClick={() => openDay(day)}
                  className={`text-left min-w-0 overflow-hidden transition-all duration-150 ease-out active:scale-[0.995] ${compact ? 'p-1' : 'p-2'} ${
                    isSelected ? 'bg-accent-blue/10' : 'hover:bg-bg-hover/55'
                  } bg-bg-primary ${inMonth ? '' : 'opacity-60'}`}
                >
                  <div className={`${compact ? 'h-6 justify-start' : 'h-7 justify-center'} flex`}>
                    <span className={`${compact ? 'min-w-6 h-6 text-xs' : 'min-w-7 h-7 text-sm'} px-2 rounded-full flex items-center justify-center font-semibold ${
                      isToday
                        ? 'bg-accent-blue text-white'
                        : isSelected
                          ? 'bg-bg-hover text-text-primary border border-accent-blue/60'
                          : inMonth
                            ? 'text-text-primary'
                            : 'text-text-muted'
                    }`}>
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, compact ? 2 : 4).map(e => (
                      <div key={e.id} className={`${compact ? 'h-[18px] text-[10px] leading-[18px] px-1' : 'h-[22px] text-[11px] leading-[22px] px-2'} rounded-md border border-accent-blue/25 bg-accent-blue/10 text-accent-blue truncate`}>
                        <span className="font-bold">{timeLabel(e.start_at)}</span>{compact ? '' : ` ${e.title}`}
                      </div>
                    ))}
                    {dayEvents.length > (compact ? 2 : 4) && (
                      <div className="text-[10px] text-text-secondary px-1">+{dayEvents.length - (compact ? 2 : 4)} more</div>
                    )}
                  </div>
                </button>
              )
            })}
            </div>
          </div>
        </main>
        )}
      </div>

      {dayOpen && !compact && (
        <div className="absolute inset-y-16 right-0 z-40 w-[380px] border-l border-border bg-bg-secondary shadow-2xl flex flex-col">
          <div className="p-4 border-b border-border flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted font-bold">Day details</p>
              <h3 className="text-lg font-black leading-tight mt-1">{fullDate(selected)}</h3>
              <p className="text-xs text-text-muted mt-1">{selectedEvents.length} memo / temu janji</p>
            </div>
            <button onClick={() => setDayOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 border-b border-border">
            <button onClick={() => openCreate(selected)} className="h-10 w-full rounded-xl bg-accent-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-500">
              <Plus size={16} />
              Tambah memo / temu janji
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedEvents.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-text-muted">
                <CalendarDays size={36} className="opacity-25 mb-3" />
                <p className="text-sm font-bold text-text-secondary">Tiada memo atau temu janji</p>
                <p className="text-xs mt-1 max-w-[240px]">Tekan button tambah untuk simpan kerja, appointment, atau nota technician pada hari ini.</p>
              </div>
            ) : selectedEvents.map(e => (
              <button key={e.id} onClick={() => setEventDetail(e)} className="w-full text-left rounded-xl border border-border bg-bg-primary p-4 hover:bg-bg-hover transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black leading-snug">{e.title}</p>
                    <p className="text-xs text-accent-blue flex items-center gap-1.5 mt-2">
                      <Clock size={13} /> {timeLabel(e.start_at)}
                    </p>
                  </div>
                  <button onClick={(ev) => { ev.stopPropagation(); removeEvent(e.id) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-status-danger/10 hover:text-status-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
                {e.name && <p className="text-xs text-text-secondary mt-3">{e.name}</p>}
                {e.location && (
                  <p className="text-xs text-text-muted mt-3 flex items-start gap-1.5">
                    <MapPin size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{e.location}</span>
                  </p>
                )}
                {e.description && <p className="text-xs text-text-secondary mt-3 whitespace-pre-wrap">{e.description}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-[480px] rounded-2xl border border-border bg-bg-secondary shadow-2xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black">Tambah memo / temu janji</h3>
                <p className="text-xs text-text-muted mt-1">Simpan kerja technician, appointment customer, atau nota harian.</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-text-secondary">Tajuk</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Contoh: Check elektrik trip rumah customer"
                  className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label className="text-xs font-bold text-text-secondary">Tarikh</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-secondary">Masa</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm({ ...form, time: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-text-secondary">Lokasi</label>
                <input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="Contoh: No 5 Jalan Binjai 3, Kota Tinggi"
                  className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-secondary">Memo</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder="Nota kerja, detail customer, atau perkara perlu dibawa."
                  className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue resize-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setCreateOpen(false)} className="h-10 px-4 rounded-lg border border-border bg-bg-tertiary hover:bg-bg-hover text-sm font-semibold">
                Cancel
              </button>
              <button onClick={saveManualEvent} disabled={!form.title.trim()} className="h-10 px-4 rounded-lg bg-accent-blue text-white hover:bg-blue-500 disabled:opacity-40 text-sm font-bold">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {eventDetail && (
        <div className="absolute inset-0 z-[60] bg-black/55 flex items-center justify-center p-6">
          <div className="w-full max-w-[560px] rounded-2xl border border-border bg-bg-secondary shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-text-muted font-bold">Memo / Temu janji</p>
                <h3 className="text-xl font-black leading-tight mt-1">{eventDetail.title}</h3>
                <p className="text-sm text-accent-blue flex items-center gap-1.5 mt-3">
                  <Clock size={15} /> {fullDate(new Date(eventDetail.start_at))}, {timeLabel(eventDetail.start_at)}
                </p>
              </div>
              <button onClick={() => setEventDetail(null)} className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {eventDetail.name && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted font-bold mb-1">Customer</p>
                  <p className="text-sm text-text-primary">{eventDetail.name}{eventDetail.phone ? ` · ${eventDetail.phone}` : ''}</p>
                </div>
              )}
              {eventDetail.location && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted font-bold mb-1">Lokasi</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap flex items-start gap-2">
                    <MapPin size={15} className="mt-0.5 text-accent-blue flex-shrink-0" />
                    <span>{eventDetail.location}</span>
                  </p>
                </div>
              )}
              {eventDetail.description && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted font-bold mb-1">Memo</p>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{eventDetail.description}</p>
                </div>
              )}
              {!eventDetail.location && !eventDetail.description && !eventDetail.name && (
                <p className="text-sm text-text-muted">Tiada detail tambahan untuk memo ini.</p>
              )}
            </div>

            <div className="p-5 border-t border-border flex justify-between gap-2">
              <button onClick={() => { removeEvent(eventDetail.id); setEventDetail(null) }} className="h-10 px-4 rounded-lg bg-status-danger/10 text-status-danger hover:bg-status-danger/20 text-sm font-bold flex items-center gap-2">
                <Trash2 size={15} /> Delete
              </button>
              <button onClick={() => setEventDetail(null)} className="h-10 px-4 rounded-lg border border-border bg-bg-tertiary hover:bg-bg-hover text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Filter,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageSquarePlus,
  Moon,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TicketCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import aranedaLogo from './assets/araneda-logo.svg'
import { emptyCatalogs } from './data'
import {
  createArea,
  createCategory,
  createFollowUp,
  createReason,
  createServiceCase,
  getCurrentUserProfile,
  loadCases,
  loadCatalogs,
  loadFollowUps,
  loadUsers,
  softDeleteServiceCase,
  updateArea,
  updateCategory,
  updateReason,
  updateServiceCase,
  updateUserProfile,
} from './lib/portalApi'
import { initializeAuth, isAuthConfigured, signInMicrosoft, signOutMicrosoft } from './lib/auth'
import type { Catalogs, CaseStatus, CaseType, FollowUp, ServiceCase, UserProfile, UserRole } from './types'

const caseTypeLabels: Record<CaseType, string> = {
  order_increase: 'Aumentar pedido',
  complaint: 'Reclamo',
  requirement: 'Requerimiento',
}

const statusLabels: Record<CaseStatus, string> = {
  registered: 'Registrado',
  assigned: 'Asignado',
  in_progress: 'En gestion',
  waiting_customer: 'Pendiente cliente',
  waiting_area: 'Pendiente area',
  responded: 'Respondido',
  solved: 'Solucionado',
  closed: 'Finiquitado',
  cancelled: 'Cancelado',
}

const actionableStatuses: CaseStatus[] = ['registered', 'assigned', 'in_progress', 'waiting_customer', 'waiting_area']
const closedStatuses: CaseStatus[] = ['responded', 'solved', 'closed', 'cancelled']
const casePageSize = 5

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  support: 'Postventa',
  customer: 'Cliente',
}

const allowedSystemEmails = new Set(['juanjose.cordova@araneda.com.ec', 'paola.suquinagua@araneda.com.ec'])

const navItems = [
  ['dashboard', LayoutDashboard, 'Dashboard'],
  ['cases', TicketCheck, 'Casos'],
  ['catalogs', Settings, 'Catalogos'],
  ['users', Users, 'Usuarios'],
  ['reports', BarChart3, 'Reportes'],
] as const

type ThemeMode = 'light' | 'dark'
type RefreshOptions = {
  preserveSelection?: boolean
  silent?: boolean
}

type CaseFormState = {
  type: CaseType
  customer: string
  requesterName: string
  requesterEmail: string
  receptionAt: string
  branch: string
  address: string
  receptionChannelId: string
  dispatched: boolean
  reason: string
  areaId: string
  priority: ServiceCase['priority']
  slaDays: number
}

const emptyForm: CaseFormState = {
  type: 'order_increase',
  customer: '',
  requesterName: '',
  requesterEmail: '',
  receptionAt: '',
  branch: '',
  address: '',
  receptionChannelId: '',
  dispatched: false,
  reason: '',
  areaId: '',
  priority: 'normal',
  slaDays: 1,
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('araneda-theme') === 'dark' ? 'dark' : 'light'
  })
  const [activeView, setActiveView] = useState('dashboard')
  const [role, setRole] = useState<UserRole>('support')
  const [cases, setCases] = useState<ServiceCase[]>([])
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [managingCaseId, setManagingCaseId] = useState<string>()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<CaseType | 'all'>('all')
  const [form, setForm] = useState<CaseFormState>(emptyForm)
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('araneda-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!isAuthConfigured) {
      setAuthLoading(false)
      return
    }

    initializeAuth().then((account) => {
      setIsAuthenticated(Boolean(account))
      setAuthLoading(false)
    })
  }, [])

  const managingCase = cases.find((serviceCase) => serviceCase.id === managingCaseId)

  const visibleCases = useMemo(() => {
    return cases.filter((serviceCase) => {
      const matchesSearch = [serviceCase.caseNumber, serviceCase.customer, serviceCase.requesterName, serviceCase.area]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
      const matchesStatus = statusFilter === 'all' || serviceCase.status === statusFilter
      const matchesType = typeFilter === 'all' || serviceCase.type === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [cases, query, statusFilter, typeFilter])

  const metrics = useMemo(() => {
    const pending = visibleCases.filter((item) => actionableStatuses.includes(item.status)).length
    const waiting = visibleCases.filter((item) => ['waiting_area', 'waiting_customer'].includes(item.status)).length
    const finished = visibleCases.filter((item) => ['responded', 'solved', 'closed'].includes(item.status)).length
    const cancelled = visibleCases.filter((item) => item.status === 'cancelled').length

    return { pending, waiting, finished, cancelled }
  }, [visibleCases])

  const refreshAppData = useCallback(async (options: RefreshOptions = {}) => {
    if (!options.silent) setLoading(true)
    setError('')

    try {
      const profile = await getCurrentUserProfile()
      const [nextCatalogs, nextCases, nextUsers] = await Promise.all([
        loadCatalogs(),
        loadCases(),
        profile?.role === 'admin' ? loadUsers() : Promise.resolve([]),
      ])

      setRole(profile?.role ?? 'support')
      setCatalogs(nextCatalogs)
      setCases(nextCases)
      setUsers(nextUsers)
      setManagingCaseId((current) => {
        if (options.preserveSelection && current && nextCases.some((item) => item.id === current)) return current
        return undefined
      })
      setForm(createInitialForm(nextCatalogs, 'order_increase'))
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'No se pudo cargar la informacion.')
      if (currentError instanceof Error && currentError.message.includes('no esta autorizado')) {
        setIsAuthenticated(false)
      }
    } finally {
      if (!options.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    refreshAppData()
  }, [isAuthenticated, refreshAppData])

  const handleTypeChange = (type: CaseType) => {
    const nextForm = createInitialForm(catalogs, type)
    setForm((current) => ({
      ...nextForm,
      customer: current.customer,
      requesterName: current.requesterName,
      receptionAt: current.receptionAt,
      branch: type === 'order_increase' ? current.branch : '',
    }))
  }

  const createCase = async () => {
    setSaving(true)
    setError('')

    try {
      const newCase = await createServiceCase(form)
      setCases((current) => [newCase, ...current])
      setActiveView('cases')
      setForm(createInitialForm(catalogs, 'order_increase'))
      setIsNewCaseOpen(false)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'No se pudo registrar el caso.')
    } finally {
      setSaving(false)
    }
  }

  const handleCaseUpdated = (updatedCase: ServiceCase) => {
    setCases((current) => current.map((item) => (item.id === updatedCase.id ? updatedCase : item)))
    setManagingCaseId(updatedCase.id)
  }

  const handleCaseDeleted = (caseId: string) => {
    setCases((current) => current.filter((item) => item.id !== caseId))
    setManagingCaseId((current) => (current === caseId ? undefined : current))
  }

  const exportCsv = () => {
    const rows = visibleCases.map((item) => ({
      numero: item.caseNumber,
      tipo: caseTypeLabels[item.type],
      cliente: item.customer,
      estado: statusLabels[item.status],
      area: item.area,
      fecha_recepcion: formatDate(item.receptionAt),
      fecha_registro_sistema: formatDate(item.registeredAt),
    }))
    const csv = [Object.keys(rows[0] ?? {}).join(','), ...rows.map((row) => Object.values(row).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'casos-araneda.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const signInWithMicrosoft = async () => {
    const account = await signInMicrosoft()
    setIsAuthenticated(Boolean(account))
  }

  const signOut = async () => {
    await signOutMicrosoft()
    setIsAuthenticated(false)
    setCases([])
  }

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

  if (authLoading) {
    return <LoadingScreen text="Validando sesion..." />
  }

  if (!isAuthenticated) {
    return <LoginScreen onMicrosoftLogin={signInWithMicrosoft} onThemeToggle={toggleTheme} theme={theme} />
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <div className="mb-8 flex items-center gap-3">
          <img alt="Araneda" className="brand-logo brand-logo-sidebar" src={aranedaLogo} />
          <div>
            <h1 className="text-xl font-bold">Portal de Pedidos</h1>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map(([id, Icon, label]) => (
            <button
              className={`nav-item ${activeView === id ? 'nav-item-active' : ''}`}
              key={id}
              onClick={() => setActiveView(id)}
              type="button"
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rol activo</p>
          <strong className="mt-2 block text-sm">{roleLabels[role]}</strong>
        </div>
      </aside>

      <section className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Atencion al Cliente Araneda</p>
              <h2 className="text-2xl font-bold tracking-tight">Gestion de pedidos, reclamos y requerimientos</h2>
            </div>
            <div className="header-actions">
              <label className="top-search">
                <Search className="size-4 text-slate-400" />
                <input
                  onChange={(event) => {
                    setQuery(event.target.value)
                    if (event.target.value) setActiveView('cases')
                  }}
                  placeholder="Buscar caso, cliente o area"
                  value={query}
                />
              </label>
              <button className="secondary-button" onClick={() => refreshAppData()} type="button">
                Actualizar
              </button>
              <ThemeToggle onToggle={toggleTheme} theme={theme} />
              <button className="secondary-button" onClick={exportCsv} type="button">
                <Download className="size-4" />
                CSV
              </button>
              <button className="secondary-button" onClick={signOut} type="button">
                <LogOut className="size-4" />
                Salir
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}
          <nav className="mobile-nav">
            {navItems.map(([id, Icon, label]) => (
              <button
                className={`mobile-nav-item ${activeView === id ? 'mobile-nav-item-active' : ''}`}
                key={id}
                onClick={() => setActiveView(id)}
                type="button"
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="grid gap-5 p-5 lg:p-8">
          {loading ? (
            <LoadingBlock />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={AlertTriangle} label="Por atender" tone="danger" value={metrics.pending} />
                <MetricCard icon={Clock3} label="En espera" tone="warning" value={metrics.waiting} />
                <MetricCard icon={CheckCircle2} label="Finiquitados" tone="success" value={metrics.finished} />
                <MetricCard icon={TicketCheck} label="Cancelados" value={metrics.cancelled} />
              </section>

              {activeView === 'dashboard' && <Dashboard cases={visibleCases} />}
              {activeView === 'cases' && (
                <CaseWorkspace
                  catalogs={catalogs}
                  createCase={createCase}
                  form={form}
                  handleTypeChange={handleTypeChange}
                  isNewCaseOpen={isNewCaseOpen}
                  cases={visibleCases}
                  allCases={cases}
                  onCaseDeleted={handleCaseDeleted}
                  onCaseUpdated={handleCaseUpdated}
                  query={query}
                  saving={saving}
                  managingCase={managingCase}
                  setForm={setForm}
                  setIsNewCaseOpen={setIsNewCaseOpen}
                  setQuery={setQuery}
                  setManagingCaseId={setManagingCaseId}
                  setStatusFilter={setStatusFilter}
                  setTypeFilter={setTypeFilter}
                  statusFilter={statusFilter}
                  typeFilter={typeFilter}
                />
              )}
              {activeView === 'catalogs' && <CatalogsView catalogs={catalogs} onRefresh={refreshAppData} role={role} />}
              {activeView === 'users' && (
                <UsersView
                  areas={catalogs.areas}
                  onRefresh={refreshAppData}
                  role={role}
                  users={users}
                />
              )}
              {activeView === 'reports' && <ReportsView cases={visibleCases} />}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function ThemeToggle({ onToggle, theme }: { onToggle: () => void; theme: ThemeMode }) {
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <button className="secondary-button theme-toggle" onClick={onToggle} type="button" title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
      <Icon className="size-4" />
      {theme === 'dark' ? 'Claro' : 'Oscuro'}
    </button>
  )
}

function LoginScreen({
  onMicrosoftLogin,
  onThemeToggle,
  theme,
}: {
  onMicrosoftLogin: () => void
  onThemeToggle: () => void
  theme: ThemeMode
}) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <img alt="Araneda" className="brand-logo brand-logo-login" src={aranedaLogo} />
          <div>
            <h1>Portal de Pedidos</h1>
          </div>
        </div>

        <div className="login-copy">
          <p>Atencion al Cliente</p>
          <h2>Ingresa para gestionar pedidos, reclamos y requerimientos.</h2>
          <span>Acceso exclusivo para usuarios autorizados de Araneda.</span>
        </div>

        <div className="login-actions">
          <button className="primary-button" disabled={!isAuthConfigured} onClick={onMicrosoftLogin} type="button">
            Iniciar sesion con Microsoft
          </button>
          <ThemeToggle onToggle={onThemeToggle} theme={theme} />
        </div>

        {!isAuthConfigured && (
          <div className="login-warning">
            <LockKeyhole className="size-4" />
            El ingreso aun no esta habilitado.
          </div>
        )}
      </section>

      <aside className="login-aside">
        <div>
          <ShieldCheck className="size-8 text-teal-500" />
          <h3>Acceso por perfil</h3>
          <p>Cada usuario ve solamente las opciones y registros que le corresponden.</p>
        </div>
        <div>
          <Clock3 className="size-8 text-amber-500" />
          <h3>Trazabilidad</h3>
          <p>Los casos conservan historial, fecha limite, seguimiento publico e interno.</p>
        </div>
      </aside>
    </main>
  )
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <div className="panel text-center">
        <Clock3 className="mx-auto size-8 text-teal-500" />
        <p className="mt-3 font-semibold text-slate-700">{text}</p>
      </div>
    </main>
  )
}

function LoadingBlock() {
  return (
    <section className="panel">
      <div className="empty-state">Cargando informacion...</div>
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  tone = 'default',
  value,
}: {
  icon: typeof TicketCheck
  label: string
  tone?: 'default' | 'danger' | 'warning' | 'success'
  value: number
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <Icon className="size-5" />
      </div>
      <strong>{value}</strong>
    </article>
  )
}

function Dashboard({ cases }: { cases: ServiceCase[] }) {
  const statusCounts = Object.entries(statusLabels).map(([status, label]) => ({
    status: status as CaseStatus,
    label,
    count: cases.filter((item) => item.status === status).length,
  }))
  const maxStatusCount = Math.max(1, ...statusCounts.map((item) => item.count))
  const priorityCases = cases.filter((item) => actionableStatuses.includes(item.status))

  return (
    <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
      <div className="panel xl:col-span-2">
        <div className="panel-title">
          <div>
            <p>Gestion</p>
            <h3>Casos por estado</h3>
          </div>
          <BarChart3 className="size-5 text-teal-500" />
        </div>
        <div className="status-chart">
          {statusCounts.map((item) => (
            <div className="status-bar-row" key={item.status}>
              <span>{item.label}</span>
              <div className="status-bar-track">
                <div className={`status-bar-fill status-bar-${item.status}`} style={{ width: `${Math.max(4, (item.count / maxStatusCount) * 100)}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <div>
            <p>Operacion</p>
            <h3>Casos que requieren gestion</h3>
          </div>
          <Filter className="size-5 text-slate-400" />
        </div>
        <div className="mt-5 grid gap-3">
          {priorityCases.length ? priorityCases.slice(0, 5).map((item) => <CaseRow key={item.id} serviceCase={item} />) : <EmptyCases message="No hay casos pendientes por gestionar." />}
        </div>
      </div>
    </section>
  )
}

function CaseWorkspace(props: {
  allCases: ServiceCase[]
  catalogs: Catalogs
  cases: ServiceCase[]
  createCase: () => void
  form: CaseFormState
  handleTypeChange: (type: CaseType) => void
  isNewCaseOpen: boolean
  managingCase?: ServiceCase
  onCaseDeleted: (caseId: string) => void
  onCaseUpdated: (serviceCase: ServiceCase) => void
  query: string
  saving: boolean
  setForm: React.Dispatch<React.SetStateAction<CaseFormState>>
  setIsNewCaseOpen: (open: boolean) => void
  setManagingCaseId: (id?: string) => void
  setQuery: (query: string) => void
  setStatusFilter: (status: string) => void
  setTypeFilter: (type: CaseType | 'all') => void
  statusFilter: string
  typeFilter: CaseType | 'all'
}) {
  const casesToManage = props.cases.filter((item) => actionableStatuses.includes(item.status))
  const historicalCases = props.cases.filter((item) => closedStatuses.includes(item.status))

  const closeNewCaseModal = () => {
    props.setIsNewCaseOpen(false)
    props.setForm(createInitialForm(props.catalogs, 'order_increase'))
  }

  return (
    <section className="case-workspace">
      <div className="panel">
        <div className="case-toolbar">
          <div className="case-toolbar-filters">
            <label className="search-box">
              <Search className="size-4 text-slate-400" />
              <input onChange={(event) => props.setQuery(event.target.value)} placeholder="Buscar por numero, cliente, area..." value={props.query} />
            </label>
            <select className="input-sm" onChange={(event) => props.setTypeFilter(event.target.value as CaseType | 'all')} value={props.typeFilter}>
              <option value="all">Todos los tipos</option>
              {Object.entries(caseTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select className="input-sm" onChange={(event) => props.setStatusFilter(event.target.value)} value={props.statusFilter}>
              <option value="all">Todos los estados</option>
              <optgroup label="Por gestionar">
                {actionableStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Finalizados">
                {closedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              props.setManagingCaseId(undefined)
              props.setForm(createInitialForm(props.catalogs, 'order_increase'))
              props.setIsNewCaseOpen(true)
            }}
            type="button"
          >
            <Plus className="size-4" />
            Nuevo caso
          </button>
        </div>
        <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
          {props.cases.length ? (
            <>
              <CaseSection
                actionLabel="Gestionar"
                cases={casesToManage}
                emptyMessage="No hay casos pendientes por gestionar."
                onManage={props.setManagingCaseId}
                title="Por gestionar"
              />
              <CaseSection
                actionLabel="Ver proceso"
                cases={historicalCases}
                emptyMessage="No hay casos finalizados."
                onManage={props.setManagingCaseId}
                title="Finalizados e historial"
              />
            </>
          ) : (
            <EmptyCases />
          )}
        </div>
      </div>
      {props.managingCase && (
        <CaseModal onClose={() => props.setManagingCaseId(undefined)}>
          <CaseDetail
            catalogs={props.catalogs}
            onCaseDeleted={(caseId) => {
              props.onCaseDeleted(caseId)
              props.setManagingCaseId(undefined)
            }}
            onCaseUpdated={props.onCaseUpdated}
            serviceCase={props.managingCase}
          />
        </CaseModal>
      )}
      {props.isNewCaseOpen && (
        <CaseModal onClose={closeNewCaseModal}>
          <NewCaseForm
            catalogs={props.catalogs}
            cases={props.allCases}
            createCase={props.createCase}
            form={props.form}
            handleTypeChange={props.handleTypeChange}
            saving={props.saving}
            setForm={props.setForm}
          />
        </CaseModal>
      )}
    </section>
  )
}

function CaseSection({
  actionLabel,
  cases,
  emptyMessage,
  onManage,
  title,
}: {
  actionLabel: string
  cases: ServiceCase[]
  emptyMessage: string
  onManage: (id?: string) => void
  title: string
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(cases.length / casePageSize))
  const activePage = Math.min(page, totalPages)
  const pageStart = cases.length ? (activePage - 1) * casePageSize : 0
  const pageEnd = Math.min(pageStart + casePageSize, cases.length)
  const pagedCases = cases.slice(pageStart, pageEnd)

  return (
    <section className={`case-section ${isOpen ? 'case-section-open' : 'case-section-collapsed'}`}>
      <button className="case-section-title" onClick={() => setIsOpen((current) => !current)} type="button" aria-expanded={isOpen}>
        <span>{title}</span>
        <div>
          <strong>{cases.length}</strong>
          <ChevronDown className="size-4" />
        </div>
      </button>
      {isOpen && (
        <div className="case-section-body">
          {cases.length ? (
            <>
              <div className="case-pagination-summary">
                <span>
                  Mostrando {pageStart + 1}-{pageEnd} de {cases.length}
                </span>
                {totalPages > 1 && (
                  <div>
                    <button className="secondary-button" disabled={activePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
                      Anterior
                    </button>
                    <button className="secondary-button" disabled={activePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
              {pagedCases.map((item) => (
                <div className="case-list-row" key={item.id}>
                  <div className="case-list-main">
                    <CaseRow serviceCase={item} />
                  </div>
                  <button className="secondary-button case-manage-button" onClick={() => onManage(item.id)} type="button">
                    <Pencil className="size-4" />
                    {actionLabel}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <EmptyCases message={emptyMessage} />
          )}
        </div>
      )}
    </section>
  )
}

function CaseRow({ serviceCase }: { serviceCase: ServiceCase }) {
  const caseSummary = [serviceCase.customer, serviceCase.reason, serviceCase.area].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <strong>{serviceCase.caseNumber}</strong>
          <Badge>{caseTypeLabels[serviceCase.type]}</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">{caseSummary}</p>
      </div>
      <StatusBadge status={serviceCase.status} />
    </div>
  )
}

function CaseModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div aria-modal="true" className="case-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <button className="icon-button modal-close" onClick={onClose} type="button" title="Cerrar">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

function MessageDialog({ message, onClose }: { message: { title: string; body: string; tone?: 'danger' | 'info' }; onClose: () => void }) {
  return (
    <div className="message-backdrop" onMouseDown={onClose} role="presentation">
      <div aria-modal="true" className={`message-dialog message-dialog-${message.tone ?? 'info'}`} onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div>
          <strong>{message.title}</strong>
          <p>{message.body}</p>
        </div>
        <button className="primary-button" onClick={onClose} type="button">
          Aceptar
        </button>
      </div>
    </div>
  )
}

function ConfirmDialog({
  dialog,
  disabled,
  onClose,
}: {
  dialog: { title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> | void }
  disabled?: boolean
  onClose: () => void
}) {
  const confirm = async () => {
    await dialog.onConfirm()
    onClose()
  }

  return (
    <div className="message-backdrop" onMouseDown={onClose} role="presentation">
      <div aria-modal="true" className="message-dialog message-dialog-danger" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div>
          <strong>{dialog.title}</strong>
          <p>{dialog.body}</p>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" disabled={disabled} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="primary-button danger-button" disabled={disabled} onClick={confirm} type="button">
            {disabled ? 'Eliminando...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function CaseDetail({
  catalogs,
  onCaseDeleted,
  onCaseUpdated,
  serviceCase,
}: {
  catalogs: Catalogs
  onCaseDeleted: (caseId: string) => void
  onCaseUpdated: (serviceCase: ServiceCase) => void
  serviceCase: ServiceCase
}) {
  const [items, setItems] = useState<FollowUp[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [messageDialog, setMessageDialog] = useState<{ title: string; body: string; tone?: 'danger' | 'info' }>()
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> | void }>()
  const [followUpForm, setFollowUpForm] = useState({
    comment: '',
    visibility: 'internal' as FollowUp['visibility'],
  })
  const [editForm, setEditForm] = useState({
    type: serviceCase.type,
    requesterName: serviceCase.requesterName,
    requesterEmail: serviceCase.requesterEmail,
    receptionAt: toDateTimeLocalValue(serviceCase.receptionAt),
    address: serviceCase.address ?? '',
    dispatched: Boolean(serviceCase.dispatched),
    status: serviceCase.status,
    areaId: serviceCase.areaId ?? '',
    priority: serviceCase.priority,
    slaDays: serviceCase.slaDays,
    publicResponse: serviceCase.publicResponse ?? '',
    internalSummary: serviceCase.internalSummary ?? '',
  })
  const isCaseLocked = serviceCase.status === 'closed' || serviceCase.status === 'cancelled'

  const reloadFollowUps = useCallback(() => {
    loadFollowUps(serviceCase.id)
      .then(setItems)
      .catch(() => setItems([]))
  }, [serviceCase.id])

  useEffect(() => {
    reloadFollowUps()
  }, [reloadFollowUps])

  useEffect(() => {
    setEditForm({
      type: serviceCase.type,
      requesterName: serviceCase.requesterName,
      requesterEmail: serviceCase.requesterEmail,
      receptionAt: toDateTimeLocalValue(serviceCase.receptionAt),
      address: serviceCase.address ?? '',
      dispatched: Boolean(serviceCase.dispatched),
      status: serviceCase.status,
      areaId: serviceCase.areaId ?? '',
      priority: serviceCase.priority,
      slaDays: serviceCase.slaDays,
      publicResponse: serviceCase.publicResponse ?? '',
      internalSummary: serviceCase.internalSummary ?? '',
    })
    setIsEditing(false)
    setIsAddingFollowUp(false)
  }, [serviceCase])

  const saveCase = async () => {
    if (isCaseLocked) return
    setIsSaving(true)
    try {
      const updatedCase = await updateServiceCase(serviceCase.id, editForm)
      onCaseUpdated(updatedCase)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteCase = async () => {
    if (isCaseLocked) return
    setConfirmDialog({
      title: 'Eliminar caso',
      body: `Se eliminara el caso ${serviceCase.caseNumber}. Esta accion no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setIsSaving(true)
        try {
          await softDeleteServiceCase(serviceCase.id)
          onCaseDeleted(serviceCase.id)
        } finally {
          setIsSaving(false)
        }
      },
    })
  }

  const saveFollowUp = async () => {
    if (isCaseLocked) return
    if (!followUpForm.comment.trim()) return

    setIsSaving(true)
    try {
      const followUp = await createFollowUp({
        caseId: serviceCase.id,
        comment: followUpForm.comment,
        visibility: followUpForm.visibility,
      })
      setItems((current) => [followUp, ...current])
      setFollowUpForm({ comment: '', visibility: 'internal' })
      setIsAddingFollowUp(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
    <aside className="panel">
      <div className="panel-title">
        <div>
          <p>Detalle del caso</p>
          <div className="case-detail-heading">
            <h3>{serviceCase.caseNumber}</h3>
            <StatusBadge status={serviceCase.status} />
          </div>
        </div>
        <div className="inline-actions">
          <button className="icon-button" disabled={isCaseLocked} onClick={() => setIsEditing((current) => !current)} type="button" title={isCaseLocked ? 'Caso bloqueado' : 'Editar caso'}>
            <Pencil className="size-4" />
          </button>
          <button className="icon-button danger-icon" disabled={isSaving || isCaseLocked} onClick={deleteCase} type="button" title={isCaseLocked ? 'Caso bloqueado' : 'Eliminar caso'}>
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {isCaseLocked && <div className="locked-notice">Caso bloqueado: solo visualizacion porque esta cerrado o cancelado.</div>}

      {isEditing ? (
        <div className="edit-case-form">
          <Field label="Solicitante">
            <input value={editForm.requesterName} onChange={(event) => setEditForm((current) => ({ ...current, requesterName: event.target.value }))} />
          </Field>
          <Field label="Fecha de recepcion">
            <input value={editForm.receptionAt} onChange={(event) => setEditForm((current) => ({ ...current, receptionAt: event.target.value }))} type="datetime-local" />
          </Field>
          <Field label="Estado">
            <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as CaseStatus }))}>
              <optgroup label="Por gestionar">
                {actionableStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Finalizados">
                {closedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label="Area responsable">
            <select value={editForm.areaId} onChange={(event) => setEditForm((current) => ({ ...current, areaId: event.target.value }))}>
              {catalogs.areas.filter((area) => area.active !== false).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value as ServiceCase['priority'] }))}>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="critical">Critica</option>
            </select>
          </Field>
          {serviceCase.type === 'order_increase' && (
            <label className="user-toggle">
              <input checked={editForm.dispatched} onChange={(event) => setEditForm((current) => ({ ...current, dispatched: event.target.checked }))} type="checkbox" />
              Pedido despachado
            </label>
          )}
          <Field label="Respuesta">
            <textarea value={editForm.publicResponse} onChange={(event) => setEditForm((current) => ({ ...current, publicResponse: event.target.value }))} rows={3} />
          </Field>
          <Field label="Resumen interno">
            <textarea value={editForm.internalSummary} onChange={(event) => setEditForm((current) => ({ ...current, internalSummary: event.target.value }))} rows={3} />
          </Field>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setIsEditing(false)} type="button">
              Cancelar
            </button>
            <button className="primary-button" disabled={isSaving || !editForm.areaId} onClick={saveCase} type="button">
              <Save className="size-4" />
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Info label="Cliente" value={serviceCase.customer} />
          <Info label="Solicitante" value={serviceCase.requesterName} />
          <Info label="Canal" value={serviceCase.receptionChannel} />
          <Info label="Area responsable" value={serviceCase.area} />
          <Info label="Recepcion" value={formatDate(serviceCase.receptionAt)} />
          <Info label="Registro sistema" value={formatDate(serviceCase.registeredAt)} />
        </div>
      )}

      <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Respuesta</p>
        <p className="mt-2 text-sm text-slate-700">{serviceCase.publicResponse || 'Sin respuesta publica registrada.'}</p>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold">Seguimiento</h4>
          <button className="icon-button" disabled={isCaseLocked} onClick={() => setIsAddingFollowUp((current) => !current)} type="button" title={isCaseLocked ? 'Caso bloqueado' : 'Agregar seguimiento'}>
            <MessageSquarePlus className="size-4" />
          </button>
        </div>
        {isAddingFollowUp && (
          <div className="followup-composer">
            <label>
              <span>Tipo de seguimiento</span>
              <select
                value={followUpForm.visibility}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, visibility: event.target.value as FollowUp['visibility'] }))}
              >
                <option value="internal">Interno</option>
                <option value="customer">Visible al cliente</option>
              </select>
            </label>
            <label>
              <span>Comentario</span>
              <textarea
                onChange={(event) => setFollowUpForm((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Escribe la gestion realizada, proximo paso o respuesta al cliente"
                rows={3}
                value={followUpForm.comment}
              />
            </label>
            <div className="form-actions">
              <button className="secondary-button" onClick={() => setIsAddingFollowUp(false)} type="button">
                Cancelar
              </button>
              <button className="primary-button" disabled={isSaving || !followUpForm.comment.trim()} onClick={saveFollowUp} type="button">
                <MessageSquarePlus className="size-4" />
                Guardar seguimiento
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {items.length ? (
            items.map((item) => (
              <div className="timeline-item" key={item.id}>
                <div className="flex items-center justify-between gap-2">
                  <strong>{item.author}</strong>
                  <Badge>{item.visibility === 'internal' ? 'Interno' : 'Cliente'}</Badge>
                </div>
                <p>{item.comment}</p>
                <span>{formatDate(item.createdAt)}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">Aun no hay seguimientos registrados para este caso.</div>
          )}
        </div>
      </div>
    </aside>
    {messageDialog && <MessageDialog message={messageDialog} onClose={() => setMessageDialog(undefined)} />}
    {confirmDialog && (
      <ConfirmDialog
        dialog={confirmDialog}
        disabled={isSaving}
        onClose={() => setConfirmDialog(undefined)}
      />
    )}
    </>
  )
}

function NewCaseForm({
  catalogs,
  cases,
  createCase,
  form,
  handleTypeChange,
  saving,
  setForm,
}: {
  catalogs: Catalogs
  cases: ServiceCase[]
  createCase: () => void
  form: CaseFormState
  handleTypeChange: (type: CaseType) => void
  saving: boolean
  setForm: React.Dispatch<React.SetStateAction<CaseFormState>>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const isOrderIncrease = form.type === 'order_increase'
  const canSubmit = Boolean(form.customer && form.requesterName && form.receptionAt && form.receptionChannelId && form.reason.trim() && form.areaId)
  const activeChannels = catalogs.channels.filter((channel) => channel.active !== false)
  const activeAreas = catalogs.areas.filter((area) => area.active !== false)
  const customerOptions = uniqueCaseValues(cases, (serviceCase) => serviceCase.customer)
  const requesterOptions = uniqueCaseValues(cases, (serviceCase) => serviceCase.requesterName)
  const branchOptions = uniqueCaseValues(cases, (serviceCase) => serviceCase.branch)
  const reasonOptions = uniqueCaseValues(cases, (serviceCase) => serviceCase.reason)

  const applyCustomerSuggestion = (customer: string) => {
    const previousCase = cases.find((serviceCase) => serviceCase.customer.toLowerCase() === customer.toLowerCase())
    setForm((current) => ({
      ...current,
      customer,
      requesterName: current.requesterName || previousCase?.requesterName || '',
      branch: current.branch || previousCase?.branch || '',
    }))
  }

  const focusNextField = (currentElement: HTMLElement) => {
    const fields = Array.from(formRef.current?.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea, button') ?? [])
      .filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)
    const currentIndex = fields.indexOf(currentElement)
    const nextField = fields[currentIndex + 1]
    if (nextField) {
      nextField.focus()
      return
    }
    if (canSubmit && !saving) createCase()
  }

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.target instanceof HTMLTextAreaElement) return

    event.preventDefault()
    if (event.target instanceof HTMLElement) focusNextField(event.target)
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <p>Registro</p>
          <h3>Nuevo caso</h3>
        </div>
        <TicketCheck className="size-5 text-slate-400" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {Object.entries(caseTypeLabels).map(([value, label]) => (
          <button className={`type-card ${form.type === value ? 'type-card-active' : ''}`} key={value} onClick={() => handleTypeChange(value as CaseType)} type="button">
            <span>{label}</span>
            <small>{value === 'order_increase' ? 'Incluye sucursal y despacho' : 'Oculta campos de despacho'}</small>
          </button>
        ))}
      </div>

      <form className="mt-6 grid gap-4 md:grid-cols-2" onKeyDown={handleFormKeyDown} onSubmit={(event) => event.preventDefault()} ref={formRef}>
        <AutocompleteField
          label="Cliente"
          options={customerOptions}
          required
          value={form.customer}
          onChange={(value) => setForm((current) => ({ ...current, customer: value }))}
          onSuggestionAccepted={applyCustomerSuggestion}
        />
        <AutocompleteField
          label="Nombre solicitante"
          options={requesterOptions}
          required
          value={form.requesterName}
          onChange={(value) => setForm((current) => ({ ...current, requesterName: value }))}
        />
        <Field label="Fecha de recepcion">
          <input type="datetime-local" value={form.receptionAt} onChange={(event) => setForm((current) => ({ ...current, receptionAt: event.target.value }))} />
        </Field>
        <Field label="Canal de recepcion">
          <select value={form.receptionChannelId} onChange={(event) => setForm((current) => ({ ...current, receptionChannelId: event.target.value }))}>
            <option value="">Selecciona canal</option>
            {activeChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </Field>
        <AutocompleteField
          disabled={!isOrderIncrease}
          label="Sucursal"
          options={branchOptions}
          value={form.branch}
          onChange={(value) => setForm((current) => ({ ...current, branch: value }))}
        />
        <AutocompleteField
          label="Motivo"
          options={reasonOptions}
          required
          value={form.reason}
          onChange={(value) => setForm((current) => ({ ...current, reason: value }))}
        />
        <Field label="Area responsable">
          <select value={form.areaId} onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value }))}>
            <option value="">Selecciona area</option>
            {activeAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>
        <Info label="Registro sistema" value="Automatico al guardar el caso" />
      </form>

      <div className="mt-6 flex justify-end">
        <button className="primary-button" disabled={!canSubmit || saving} onClick={createCase} type="button">
          <Plus className="size-4" />
          {saving ? 'Registrando...' : 'Registrar caso'}
        </button>
      </div>
    </section>
  )
}

function CatalogsView({ catalogs, onRefresh, role }: { catalogs: Catalogs; onRefresh: () => void; role: UserRole }) {
  const [activeCatalog, setActiveCatalog] = useState<'areas' | 'categories' | 'reasons'>('areas')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [areaName, setAreaName] = useState('')
  const [categoryType, setCategoryType] = useState<CaseType>('complaint')
  const [categoryName, setCategoryName] = useState('')
  const [reasonCategoryId, setReasonCategoryId] = useState('')
  const [reasonName, setReasonName] = useState('')
  const [busy, setBusy] = useState(false)

  const allCategories = Object.entries(catalogs.categoriesByType).flatMap(([type, categories]) =>
    categories.map((category) => ({ ...category, type: type as CaseType })),
  )
  const allReasons = Object.entries(catalogs.reasonsByType).flatMap(([type, reasons]) =>
    reasons.map((reason) => ({ ...reason, type: type as CaseType })),
  )
  const normalizedSearch = catalogSearch.trim().toLowerCase()

  const catalogItems = {
    areas: catalogs.areas.map((item) => ({ id: item.id, title: item.name, meta: 'Area responsable', active: item.active !== false })),
    categories: allCategories.map((item) => ({
      id: item.id,
      title: item.name,
      meta: caseTypeLabels[item.type],
      active: item.active !== false,
    })),
    reasons: allReasons.map((item) => ({
      id: item.id,
      title: item.name,
      meta: caseTypeLabels[item.type],
      active: item.active !== false,
    })),
  }[activeCatalog].filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(normalizedSearch))

  const saveCatalogItem = async (action: () => Promise<void>, reset: () => void) => {
    setBusy(true)
    try {
      await action()
      reset()
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const updateCatalogItem = async (id: string, values: { name: string; active: boolean }) => {
    setBusy(true)
    try {
      if (activeCatalog === 'areas') await updateArea(id, values)
      if (activeCatalog === 'categories') await updateCategory(id, values)
      if (activeCatalog === 'reasons') await updateReason(id, values)
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  if (role !== 'admin') {
    return (
      <section className="panel">
        <div className="empty-state">Solo el administrador puede cambiar parametros del portal.</div>
      </section>
    )
  }

  return (
    <section className="catalog-workspace">
      <div className="panel catalog-editor">
        <div className="panel-title">
          <div>
            <p>Parametros</p>
            <h3>Catalogos del portal</h3>
          </div>
          <Settings className="size-5 text-teal-500" />
        </div>

        <div className="catalog-tabs" role="tablist" aria-label="Catalogos">
          {[
            ['areas', Building2, 'Areas'],
            ['categories', MessageSquarePlus, 'Categorias'],
            ['reasons', Settings, 'Motivos'],
          ].map(([id, Icon, label]) => (
            <button
              className={`catalog-tab ${activeCatalog === id ? 'catalog-tab-active' : ''}`}
              key={id as string}
              onClick={() => setActiveCatalog(id as 'areas' | 'categories' | 'reasons')}
              type="button"
            >
              <Icon className="size-4" />
              {label as string}
            </button>
          ))}
        </div>

        <div className="catalog-create-panel">
          {activeCatalog === 'areas' && (
            <div className="admin-form-row">
              <input placeholder="Nueva area" value={areaName} onChange={(event) => setAreaName(event.target.value)} />
              <button
                className="primary-button"
                disabled={!areaName.trim() || busy}
                onClick={() => saveCatalogItem(() => createArea(areaName), () => setAreaName(''))}
                type="button"
              >
                Agregar
              </button>
            </div>
          )}

          {activeCatalog === 'categories' && (
            <div className="admin-form-stack">
              <select value={categoryType} onChange={(event) => setCategoryType(event.target.value as CaseType)}>
                {Object.entries(caseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="admin-form-row">
                <input placeholder="Nueva categoria" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
                <button
                  className="primary-button"
                  disabled={!categoryName.trim() || busy}
                  onClick={() => saveCatalogItem(() => createCategory(categoryType, categoryName), () => setCategoryName(''))}
                  type="button"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}

          {activeCatalog === 'reasons' && (
            <div className="admin-form-stack">
              <select value={reasonCategoryId} onChange={(event) => setReasonCategoryId(event.target.value)}>
                <option value="">Categoria del motivo</option>
                {allCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {caseTypeLabels[category.type]} · {category.name}
                  </option>
                ))}
              </select>
              <div className="admin-form-row">
                <input placeholder="Nuevo motivo" value={reasonName} onChange={(event) => setReasonName(event.target.value)} />
                <button
                  className="primary-button"
                  disabled={!reasonCategoryId || !reasonName.trim() || busy}
                  onClick={() => saveCatalogItem(() => createReason(reasonCategoryId, reasonName), () => setReasonName(''))}
                  type="button"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel catalog-results-panel">
        <div className="catalog-results-header">
          <div>
            <p className="eyebrow">Listado</p>
            <h3>{activeCatalog === 'areas' ? 'Areas' : activeCatalog === 'categories' ? 'Categorias' : 'Motivos'}</h3>
          </div>
          <strong>{catalogItems.length}</strong>
        </div>
        <label className="search-box catalog-search">
          <Search className="size-4 text-slate-400" />
          <input onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar en catalogos" value={catalogSearch} />
        </label>
        <div className="catalog-list">
          {catalogItems.length ? (
            catalogItems.map((item) => (
              <EditableCatalogItem
                active={item.active}
                disabled={busy}
                key={item.id}
                meta={item.meta}
                name={item.title}
                onSave={(values) => updateCatalogItem(item.id, values)}
              />
            ))
          ) : (
            <div className="empty-state">No hay resultados para la busqueda.</div>
          )}
        </div>
      </div>
    </section>
  )
}

function EditableCatalogItem({
  active,
  disabled,
  meta,
  name,
  onSave,
}: {
  active: boolean
  disabled: boolean
  meta: string
  name: string
  onSave: (values: { name: string; active: boolean }) => void
}) {
  const [draftName, setDraftName] = useState(name)
  const [draftActive, setDraftActive] = useState(active)

  useEffect(() => {
    setDraftName(name)
    setDraftActive(active)
  }, [active, name])

  const hasChanges = draftName.trim() !== name || draftActive !== active

  return (
    <div className={`catalog-item catalog-item-editable ${draftActive ? '' : 'catalog-item-muted'}`}>
      <div>
        <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        <span>{meta}</span>
      </div>
      <label className="user-toggle">
        <input checked={draftActive} onChange={(event) => setDraftActive(event.target.checked)} type="checkbox" />
        Activo
      </label>
      <button
        className="secondary-button"
        disabled={disabled || !draftName.trim() || !hasChanges}
        onClick={() => onSave({ name: draftName, active: draftActive })}
        type="button"
      >
        <Save className="size-4" />
        Guardar
      </button>
    </div>
  )
}
function UsersView({
  areas,
  onRefresh,
  role,
  users,
}: {
  areas: Catalogs['areas']
  onRefresh: () => void
  role: UserRole
  users: UserProfile[]
}) {
  const [savingUserId, setSavingUserId] = useState('')
  const [userSearch, setUserSearch] = useState('')

  const normalizedSearch = userSearch.trim().toLowerCase()
  const filteredUsers = users.filter((user) => {
    const isAllowedSystemUser = isAllowedAdminProfile(user)
    const matchesSearch = `${user.fullName} ${user.email} ${user.role}`.toLowerCase().includes(normalizedSearch)
    return isAllowedSystemUser && matchesSearch
  })

  const saveUser = async (user: UserProfile) => {
    if (!isAllowedAdminProfile(user)) return
    setSavingUserId(user.id)
    try {
      await updateUserProfile(user)
      onRefresh()
    } finally {
      setSavingUserId('')
    }
  }

  if (role !== 'admin') {
    return (
      <section className="panel">
        <div className="empty-state">Solo el administrador puede gestionar usuarios.</div>
      </section>
    )
  }

  return (
    <section className="users-workspace">
      <div className="panel">
        <div className="users-toolbar">
          <div>
            <p className="eyebrow">Seguridad</p>
            <h3>Administradores del sistema</h3>
          </div>
          <label className="search-box users-search">
            <Search className="size-4 text-slate-400" />
            <input onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar usuario o correo" value={userSearch} />
          </label>
        </div>
        <div className="user-section-header mt-4">
          <strong>Usuarios activos</strong>
          <span>{filteredUsers.length}</span>
        </div>
        <div className="user-list-scroll compact-user-list">
          {filteredUsers.length ? (
            <>
              <UserGridHeader />
              {filteredUsers.map((user) => (
                <EditableProfileRow
                  areas={areas}
                  disabled={Boolean(savingUserId)}
                  key={user.id}
                  onSave={saveUser}
                  saving={savingUserId === user.id}
                  user={user}
                />
              ))}
            </>
          ) : (
            <div className="empty-state">Aun no hay perfiles creados.</div>
          )}
        </div>
      </div>
    </section>
  )
}

function UserGridHeader({ editable = false }: { editable?: boolean }) {
  return (
    <div className={`user-grid-header ${editable ? 'user-grid-header-editable' : ''}`}>
      <span>Nombre</span>
      <span>Correo</span>
      <span>Rol</span>
      <span>Area</span>
      <span>Estado</span>
      <span>Accion</span>
    </div>
  )
}

function EditableProfileRow({
  areas,
  disabled,
  onSave,
  saving,
  user,
}: {
  areas: Catalogs['areas']
  disabled: boolean
  onSave: (user: UserProfile) => void
  saving: boolean
  user: UserProfile
}) {
  const [draft, setDraft] = useState(user)

  useEffect(() => setDraft(user), [user])
  const profileIsAllowed = isAllowedAdminProfile(draft)

  return (
    <div className={`user-row user-row-editable ${profileIsAllowed ? '' : 'user-row-invalid'}`}>
      <label className="mobile-field-label">
        <span>Nombre</span>
        <input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} />
      </label>
      <label className="mobile-field-label">
        <span>Correo</span>
        <input value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
      </label>
      <label className="mobile-field-label">
        <span>Rol</span>
        <select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as UserRole }))}>
        {Object.entries(roleLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
        </select>
      </label>
      <label className="mobile-field-label">
        <span>Area</span>
        <select value={draft.areaId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, areaId: event.target.value }))}>
        <option value="">Sin area</option>
        {areas.filter((area) => area.active !== false).map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
        </select>
      </label>
      <label className="user-toggle">
        <input checked={draft.active} disabled={disabled} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
        Activo
      </label>
      <button className="secondary-button" disabled={disabled || !draft.fullName.trim() || !draft.email.trim() || !profileIsAllowed} onClick={() => onSave(draft)} type="button">
        <Save className="size-4" />
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
      {!profileIsAllowed && <p className="row-help-error">Por ahora solo Juan Cordova y Paola Suquinagua pueden quedar activos como administradores.</p>}
    </div>
  )
}

function isAllowedAdminProfile(user: Pick<UserProfile, 'email' | 'role' | 'active'>) {
  return allowedSystemEmails.has(user.email.trim().toLowerCase()) && user.role === 'admin' && user.active
}
function ReportsView({ cases }: { cases: ServiceCase[] }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <p>Reportes</p>
          <h3>Resumen exportable</h3>
        </div>
        <BarChart3 className="size-5 text-teal-500" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {Object.entries(caseTypeLabels).map(([type, label]) => (
          <div className="report-block" key={type}>
            <span>{label}</span>
            <strong>{cases.filter((item) => item.type === type).length}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function Field({ children, disabled, label }: { children: React.ReactNode; disabled?: boolean; label: string }) {
  return (
    <label className={`field ${disabled ? 'field-disabled' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <p className="mt-1 font-medium">{value || 'No aplica'}</p>
    </div>
  )
}

function AutocompleteField({
  disabled,
  label,
  onChange,
  onSuggestionAccepted,
  options,
  required,
  type = 'text',
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  onSuggestionAccepted?: (value: string) => void
  options: string[]
  required?: boolean
  type?: string
  value: string
}) {
  const trimmedValue = value.trim()
  const suggestion = trimmedValue
    ? options.find((option) => option.toLowerCase().startsWith(trimmedValue.toLowerCase()) && option.toLowerCase() !== trimmedValue.toLowerCase())
    : undefined
  const completion = suggestion ? suggestion.slice(value.length) : ''

  const acceptSuggestion = () => {
    if (!suggestion) return false
    onSuggestionAccepted?.(suggestion)
    if (!onSuggestionAccepted) onChange(suggestion)
    return true
  }

  return (
    <label className={`field ${disabled ? 'field-disabled' : ''}`}>
      <span>{label}</span>
      <div className="smart-autocomplete">
        <div className="smart-autocomplete-ghost" aria-hidden="true">
          <span className="smart-autocomplete-spacer">{value}</span>
          {completion}
        </div>
        <input
          autoComplete="off"
          disabled={disabled}
          required={required}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!['Enter', 'Tab', 'ArrowRight'].includes(event.key)) return
            if (event.currentTarget.selectionStart !== value.length || event.currentTarget.selectionEnd !== value.length) return
            if (!acceptSuggestion()) return
            if (event.key !== 'Tab') event.preventDefault()
            event.stopPropagation()
          }}
        />
      </div>
    </label>
  )
}

function EmptyCases({ message = 'No hay casos registrados todavia.' }: { message?: string }) {
  return <div className="empty-state">{message}</div>
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>
}

function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`status-badge status-badge-${status}`}>{statusLabels[status]}</span>
}

function uniqueCaseValues(cases: ServiceCase[], readValue: (serviceCase: ServiceCase) => string | undefined) {
  return Array.from(
    new Set(
      cases
        .map((serviceCase) => readValue(serviceCase)?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 20)
}

function createInitialForm(catalogs: Catalogs, type: CaseType): CaseFormState {
  const activeChannels = catalogs.channels.filter((channel) => channel.active !== false)
  const activeAreas = catalogs.areas.filter((area) => area.active !== false)

  return {
    ...emptyForm,
    type,
    receptionAt: toDateTimeLocalValue(new Date().toISOString()),
    receptionChannelId: activeChannels[0]?.id ?? '',
    areaId: activeAreas[0]?.id ?? '',
    slaDays: type === 'order_increase' ? 1 : 3,
  }
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default App



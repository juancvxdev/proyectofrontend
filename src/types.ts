export type CaseType = 'order_increase' | 'complaint' | 'requirement'
export type CaseStatus =
  | 'registered'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_area'
  | 'responded'
  | 'solved'
  | 'closed'
  | 'cancelled'

export type SlaResult = 'in_progress' | 'met' | 'missed' | 'not_applicable'
export type DeadlineStatus = 'on_time' | 'due_soon' | 'overdue' | 'fulfilled' | 'closed_late'
export type UserRole = 'admin' | 'manager' | 'support' | 'customer'

export type ServiceCase = {
  id: string
  caseNumber: string
  type: CaseType
  customerId?: string
  receptionChannelId?: string
  categoryId?: string
  reasonId?: string
  areaId?: string
  customer: string
  requesterName: string
  requesterEmail: string
  branch?: string
  address?: string
  receptionChannel: string
  dispatched?: boolean
  category: string
  reason: string
  area: string
  priority: 'low' | 'normal' | 'high' | 'critical'
  slaDays: number
  receptionAt: string
  registeredAt: string
  dueAt: string
  firstResponseAt?: string
  status: CaseStatus
  slaResult: SlaResult
  deadlineStatus: DeadlineStatus
  publicResponse?: string
  internalSummary?: string
}

export type FollowUp = {
  id: string
  caseId: string
  author: string
  visibility: 'internal' | 'customer'
  comment: string
  createdAt: string
}

export type Catalogs = {
  areas: CatalogOption[]
  channels: CatalogOption[]
  categoriesByType: Record<CaseType, CatalogOption[]>
  reasonsByType: Record<CaseType, CatalogOption[]>
}

export type CatalogOption = {
  id: string
  name: string
  categoryId?: string
  active?: boolean
}

export type UserProfile = {
  id: string
  fullName: string
  email: string
  role: UserRole
  active: boolean
  areaId?: string
  customerId?: string
}

export type UserAccess = {
  id: string
  fullName: string
  email: string
  role: UserRole
  active: boolean
  areaId?: string
  customerId?: string
}

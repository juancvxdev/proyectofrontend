import type { Catalogs } from './types'

export const emptyCatalogs: Catalogs = {
  areas: [],
  channels: [],
  categoriesByType: {
    order_increase: [],
    complaint: [],
    requirement: [],
  },
  reasonsByType: {
    order_increase: [],
    complaint: [],
    requirement: [],
  },
}

export interface User {
  id: number
  email: string
}

export type PropertyType = 'Golf Course' | 'Airport' | 'Corporate Campus' | 'Other'

export interface Property {
  id: number
  name: string
  type: PropertyType
  total_acreage: number | null
  notes: string | null
  user_id: number
  created_at: string
  updated_at: string
}

export type ZoneType = 'Fairway' | 'Rough' | 'Perimeter' | 'Exclusion'
export type ZoneStatus = 'Active' | 'Inactive'

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface Zone {
  id: number
  property_id: number
  name: string
  type: ZoneType
  mower_count: number
  status: ZoneStatus
  geometry: GeoJSONPolygon
  acreage: number
  understaffed: boolean
  created_at: string
  updated_at: string
}

export interface ZoneSummary {
  total_zones: number
  total_acreage: number
  total_mowers: number
  understaffed_count: number
}

export interface GeoJSONFeature {
  type: 'Feature'
  id?: number
  geometry: GeoJSONPolygon
  properties: {
    id?: number
    name?: string
    type?: string
    mower_count?: number
    status?: string
    acreage?: number
    understaffed?: boolean
  }
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export interface ApiError {
  error: string
}

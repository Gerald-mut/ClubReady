export interface ClubProfile {
  id: string
  name: string
  county: string
  sport: string
  updatedAt: string
}

export interface Activity {
  id: string
  clubId: string
  title: string
  occurredAt: string
  createdAt: string
}

export interface PendingActivity {
  id: string
  activityId: string
  createdAt: string
}

export interface Opportunity {
  id: string
  title: string
  sourceUrl: string
  deadline?: string
}

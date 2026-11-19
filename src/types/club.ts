export interface Club {
  id: string; name: string; county: string; sub_county: string | null
  year_established: number | null; description: string | null; contact_email: string | null
  created_at: string; updated_at: string
}
export type ClubInput = Pick<Club, 'name' | 'county' | 'sub_county' | 'year_established' | 'description' | 'contact_email'>
export interface Membership { club_id: string; user_id: string; role: 'club_admin' | 'club_member'; joined_at: string }
export const documentTypes = {
  club_registration: 'Club registration', coach_qualification: 'Coach qualification',
  annual_work_programme: 'Annual work programme', safeguarding_policy: 'Safeguarding policy',
  governing_body_resolution: 'Governing body resolution', financial_report: 'Financial report', other: 'Other',
} as const
export interface Evidence {
  id: string; club_id: string; uploaded_by: string; document_type: keyof typeof documentTypes
  file_name: string; storage_path: string; mime_type: string; file_size: number
  status: 'supplied'; expires_at: string | null; uploaded_at: string
}

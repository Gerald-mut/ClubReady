import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import SupportingActivity from '../components/SupportingActivity'
const mock = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../services/supabase', () => ({ backend: () => mock, message: (error: Error) => error.message }))
beforeEach(() => { Object.values(mock).forEach(fn => fn.mockReset()); mock.from.mockReturnValue(mock); mock.select.mockReturnValue(mock); mock.eq.mockReturnValue(mock) })
it('opens exact cloud support with club scope independently of local records', async () => {
  mock.maybeSingle.mockResolvedValue({ data: { id: 'exact', club_id: 'club', title: 'Tournament', date: '2026-11-01', activity_type: 'tournament' } })
  render(<MemoryRouter initialEntries={['/play-proof?activity=exact']}><SupportingActivity clubId="club" /></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('Loading supporting activity')
  expect(await screen.findByRole('heading', { name: 'Tournament' })).toBeInTheDocument()
  expect(mock.eq.mock.calls).toEqual([['id', 'exact'], ['club_id', 'club']])
})
it('handles revoked membership as unavailable and propagates denied reads', async () => {
  mock.maybeSingle.mockResolvedValueOnce({ data: null })
  const rendered = render(<MemoryRouter initialEntries={['/?activity=exact']}><SupportingActivity clubId="club" /></MemoryRouter>)
  await screen.findByText('Activity unavailable or access has changed.'); rendered.unmount()
  mock.maybeSingle.mockResolvedValueOnce({ error: new Error('Permission denied') })
  render(<MemoryRouter initialEntries={['/?activity=exact']}><SupportingActivity clubId="club" /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
})

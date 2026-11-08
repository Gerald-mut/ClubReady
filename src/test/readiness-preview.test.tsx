import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ReadinessPreview from '../pages/Opportunities/ReadinessPreview'
import { readinessPreview, type ReadinessAdapter, type ReadinessSnapshot } from '../services/readiness-preview'

it('keeps fictional statuses and support explicit and simulates an admin recompute', async () => {
  render(<ReadinessPreview clubId="club" opportunityId="opportunity" admin />)
  expect(screen.getByText(/Fictional sample data/)).toBeInTheDocument()
  expect(screen.queryByText(/Last assessed/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open sample assessment' }))
  expect(await screen.findByText('1 of 4 sample requirements supplied')).toBeInTheDocument()
  for (const status of ['Supplied', 'Not supplied', 'Expiring', 'Expired']) expect(screen.getByText(status)).toBeInTheDocument()
  expect(screen.getByText('Document: Sample registration.pdf (sample)')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Recompute sample assessment' }))
  expect(await screen.findByText('2 of 4 sample requirements supplied')).toBeInTheDocument()
  expect(screen.getByText('Activity: Sample community tournament (sample)')).toBeInTheDocument()
  expect(screen.getByText(/Last assessed \(sample\)/)).toBeInTheDocument()
})

it('allows member reads but exposes no recompute action', async () => {
  const adapter = { load: vi.fn(readinessPreview.load), recompute: vi.fn(readinessPreview.recompute) }
  render(<ReadinessPreview clubId="club" opportunityId="opportunity" admin={false} adapter={adapter} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open sample assessment' }))
  await screen.findByText('1 of 4 sample requirements supplied')
  expect(screen.queryByRole('button', { name: /Recompute/ })).not.toBeInTheDocument()
  expect(adapter.recompute).not.toHaveBeenCalled()
  expect(adapter.load).toHaveBeenCalledWith({ clubId: 'club', opportunityId: 'opportunity' })
})

it('shows load errors, retry and empty results', async () => {
  const adapter: ReadinessAdapter = { load: vi.fn().mockRejectedValueOnce(new Error('Sample unavailable')).mockResolvedValue({ assessedAt: '2026-11-08T12:00:00Z', results: [] }), recompute: vi.fn() }
  render(<ReadinessPreview clubId="club" opportunityId="opportunity" admin adapter={adapter} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open sample assessment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sample unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Retry sample assessment' }))
  expect(await screen.findByText('No sample requirements to assess.')).toBeInTheDocument()
  expect(screen.getByText('0 of 0 sample requirements supplied')).toBeInTheDocument()
})

it('locks recompute while pending and retains the previous snapshot on failure', async () => {
  let reject!: (error: Error) => void
  const recompute = vi.fn(() => new Promise<ReadinessSnapshot>((_resolve, fail) => { reject = fail }))
  render(<ReadinessPreview clubId="club" opportunityId="opportunity" admin adapter={{ load: readinessPreview.load, recompute }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open sample assessment' }))
  await screen.findByText('1 of 4 sample requirements supplied')
  await userEvent.click(screen.getByRole('button', { name: 'Recompute sample assessment' }))
  expect(screen.getByRole('button', { name: 'Recompute sample assessment' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Assessing sample requirements')
  reject(new Error('Try again'))
  await screen.findByRole('alert')
  expect(screen.getByText('1 of 4 sample requirements supplied')).toBeInTheDocument()
  expect(screen.getByText(/Previous sample assessment retained/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recompute sample assessment' })).toBeEnabled())
})

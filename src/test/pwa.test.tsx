import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import InstallApp from '../components/InstallApp'
import PwaStatus from '../components/PwaStatus'

const mock = vi.hoisted(() => ({ refresh: false, ready: true, running: false, update: vi.fn(), later: vi.fn() }))
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ offlineReady: [mock.ready, vi.fn()], needRefresh: [mock.refresh, mock.later], updateServiceWorker: mock.update }) }))
vi.mock('../hooks/useSyncState', () => ({ useSyncState: () => ({ running: mock.running }) }))
beforeEach(() => {
  mock.refresh = false; mock.ready = true; mock.running = false; mock.update.mockReset(); mock.later.mockReset()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function offer(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome }) })
  act(() => { window.dispatchEvent(event) })
  return event
}
it('shows no fake install action on unsupported browsers', () => {
  render(<InstallApp />)
  expect(screen.queryByRole('button', { name: 'Install ClubReady' })).not.toBeInTheDocument()
})
it.each(['accepted', 'dismissed'] as const)('offers installation only after browser support, handles %s once', async outcome => {
  render(<InstallApp />)
  const event = offer(outcome)
  expect(event.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Install ClubReady' }))
  await waitFor(() => expect(event.prompt).toHaveBeenCalledOnce())
  await screen.findByText(outcome === 'accepted' ? /Installation requested/ : /You can install later/)
  expect(screen.queryByRole('button', { name: 'Install ClubReady' })).not.toBeInTheDocument()
})
it('hides installation controls when installed', () => {
  render(<InstallApp />); offer('accepted')
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('hides installation controls in standalone mode', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  render(<InstallApp />); offer('accepted')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('provides Safari instructions on iPhone without a native install button', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone Safari')
  render(<InstallApp />)
  expect(screen.getByText(/In Safari, tap Share/)).toHaveTextContent('Add to Home Screen')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('shows a useful offline message', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  render(<PwaStatus />)
  expect(screen.getByRole('status')).toHaveTextContent('Use PlayProof to record more')
})
it('never reloads automatically and requires confirmation before updating', async () => {
  mock.refresh = true
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<PwaStatus />)
  expect(mock.update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Update app' }))
  expect(mock.update).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Update app' }))
  await waitFor(() => expect(mock.update).toHaveBeenCalledWith(true))
})
it('prevents applying updates during sync', () => {
  mock.refresh = true; mock.running = true
  render(<PwaStatus />)
  expect(screen.getByRole('button', { name: 'Update app' })).toBeDisabled()
})

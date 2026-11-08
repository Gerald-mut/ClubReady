import { useSyncExternalStore } from 'react'
import { syncEngine } from '../services/sync'
export function useSyncState() { return useSyncExternalStore(syncEngine.subscribe, syncEngine.getSnapshot) }

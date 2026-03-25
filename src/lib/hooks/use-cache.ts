'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface CacheEntry<T> {
  data: T
  ts: number
}

const TTL_MS = 5 * 60 * 1000 // 5 minutos

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem('cache:' + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.ts > TTL_MS) return null // expirado
    return entry.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() }
    localStorage.setItem('cache:' + key, JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — ignore
  }
}

export function useCache<T>(key: string, fetcher: () => Promise<T>): {
  data: T | null
  loading: boolean
  refresh: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [fetching, setFetching] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const keyRef = useRef(key)
  keyRef.current = key

  const doFetch = useCallback(async () => {
    setFetching(true)
    try {
      const result = await fetcherRef.current()
      setData(result)
      writeCache(keyRef.current, result)
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    // Read cache only on client after hydration
    const cached = readCache<T>(key)
    if (cached) setData(cached)
    setHydrated(true)
    doFetch()
  }, [key, doFetch])

  // loading = true when not hydrated yet, or no data and fetching
  const loading = !hydrated || (data === null && fetching)

  return { data, loading, refresh: doFetch }
}

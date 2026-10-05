const API_URL = import.meta.env.VITE_API_URL || ''
export async function fetchAnalytics(signal) {
  if (!API_URL) return null
  const response = await fetch(`${API_URL}/analytics/overview`, { signal })
  if (!response.ok) throw new Error(`Analytics request failed (${response.status})`)
  return response.json()
}

export async function syncLiveData(keyword = '') {
  if (!API_URL) throw new Error('VITE_API_URL is not configured')
  const response = await fetch(`${API_URL}/api/sync-live-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: keyword.trim() || null })
  })
  if (!response.ok) {
    let detail
    try {
      const errorData = await response.json()
      detail = errorData?.detail
    } catch {
      detail = null
    }
    throw new Error(detail || `Live data sync failed (${response.status})`)
  }
  return response.json()
}

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OfficeLedger',
    short_name: 'OfficeLedger',
    description: '辦公室分攤記帳，支援安裝到手機主畫面。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#e7f3ec',
    theme_color: '#173a40',
    icons: [
      {
        src: '/logo192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/office-ledger-logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

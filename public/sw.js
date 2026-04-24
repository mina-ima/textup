// textup 用の最小 Service Worker。
// インストール可能性を満たすためだけに存在し、キャッシュ戦略は持たない。
// 録音 → アップロード → 文字起こしはすべてオンライン前提の機能のため、
// オフラインキャッシュは副作用が大きく意図的に実装していない。

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // パススルー（ブラウザ既定の動作）
});

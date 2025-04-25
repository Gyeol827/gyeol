// Service Worker version
const CACHE_VERSION = 'v2';
const CACHE_NAME = `monster-survivors-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;
const IMG_CACHE = `${CACHE_NAME}-images`;

// 核心资源（必须缓存）
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/images/logo.png',
  '/images/favicon.ico',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/manifest.json'
];

// 次要资源（优先缓存但非必需）
const SECONDARY_ASSETS = [
  '/images/1.jpg',
  '/images/2.jpg',
  '/images/3.jpg',
  '/images/4.jpg',
  '/images/6.jpg',
  '/images/1.png',
  '/images/2.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css'
];

// 安装Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // 缓存核心资源
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(CORE_ASSETS)),
      
      // 尝试缓存次要资源，但不阻止安装
      caches.open(DYNAMIC_CACHE)
        .then((cache) => {
          // 使用Promise.allSettled允许部分资源缓存失败
          return Promise.allSettled(
            SECONDARY_ASSETS.map(url => 
              cache.add(url).catch(error => {
                console.warn(`缓存资源失败: ${url}`, error);
                return null;
              })
            )
          );
        })
    ])
    .then(() => self.skipWaiting())
  );
});

// 激活新Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => 
            cacheName.startsWith('monster-survivors-') && 
            ![STATIC_CACHE, DYNAMIC_CACHE, IMG_CACHE].includes(cacheName)
          )
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// 网络请求处理策略
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 忽略非GET请求和iframe内部资源
  if (event.request.method !== 'GET' || 
      event.request.url.includes('cloud.onlinegames.io')) {
    return;
  }
  
  // 图片处理 - 缓存优先，网络回退
  if (event.request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return event.respondWith(handleImageRequest(event.request));
  }
  
  // HTML请求 - 网络优先，缓存回退
  if (event.request.headers.get('accept')?.includes('text/html')) {
    return event.respondWith(handleHtmlRequest(event.request));
  }
  
  // CSS/JS请求 - 缓存优先，网络更新
  if (event.request.destination === 'style' || 
      event.request.destination === 'script' ||
      url.pathname.match(/\.(css|js)$/i)) {
    return event.respondWith(handleAssetRequest(event.request));
  }
  
  // 默认策略 - 网络优先，缓存回退
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功获取网络响应后缓存
        if (response.ok) {
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, clonedResponse);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络请求失败时从缓存回退
        return caches.match(event.request);
      })
  );
});

// 图片请求处理函数
async function handleImageRequest(request) {
  // 先尝试从缓存获取
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 从网络获取图片
  try {
    const networkResponse = await fetch(request);
    
    // 只缓存成功的响应
    if (networkResponse.ok) {
      const cache = await caches.open(IMG_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // 网络获取失败，无缓存时返回占位图
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#34C759" opacity="0.1"/><text x="50%" y="50%" font-family="sans-serif" dominant-baseline="middle" text-anchor="middle" fill="#34C759">图片加载失败</text></svg>', 
      { 
        headers: { 'Content-Type': 'image/svg+xml' }
      }
    );
  }
}

// HTML请求处理函数
async function handleHtmlRequest(request) {
  try {
    // 优先从网络获取
    const networkResponse = await fetch(request);
    
    // 缓存最新的HTML
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // 网络失败，尝试从缓存获取
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 最后回退到首页
    return caches.match('/');
  }
}

// 静态资源请求处理函数
async function handleAssetRequest(request) {
  // 先从缓存获取
  const cachedResponse = await caches.match(request);
  
  // 后台刷新缓存但不等待
  fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        caches.open(DYNAMIC_CACHE)
          .then(cache => cache.put(request, networkResponse));
      }
    })
    .catch(() => {
      // 静默失败，保持用户体验
    });
  
  // 如果有缓存，立即返回
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 无缓存，等待网络响应
  try {
    const networkResponse = await fetch(request);
    
    // 缓存响应
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // 对于JS/CSS，如果获取失败且无缓存，返回空响应
    if (request.destination === 'script') {
      return new Response('console.error("资源加载失败");', {
        headers: { 'Content-Type': 'application/javascript' }
      });
    } else if (request.destination === 'style') {
      return new Response('/* 样式表加载失败 */', {
        headers: { 'Content-Type': 'text/css' }
      });
    }
    
    // 其他资源类型
    return new Response('Resource unavailable', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
} 
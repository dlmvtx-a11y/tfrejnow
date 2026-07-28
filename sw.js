var CACHE_NAME = 'tfrejnow-v5';
var CORE_ASSETS = ['index.html', 'assets/style.css', 'assets/app.js', 'assets/pages.js', 'assets/title-page.js', 'manifest.json', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(CORE_ASSETS); }).catch(function () {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function (event) {
    var url = event.request.url;
    // Never cache/intercept API calls, auth, or external CDNs - always go straight
    // to the network for those so data is never stale or wrong.
    var isExternalApi = url.indexOf('googleapis.com') > -1 || url.indexOf('firebaseio.com') > -1 ||
        url.indexOf('firestore.googleapis.com') > -1 || url.indexOf('themoviedb.org') > -1 ||
        url.indexOf('gstatic.com') > -1 || url.indexOf('tailwindcss.com') > -1 ||
        url.indexOf('googleapis.com') > -1 || url.indexOf('ipify.org') > -1 ||
        url.indexOf('emailjs.com') > -1 || url.indexOf('jsdelivr.net') > -1 ||
        url.indexOf('fonts.g') > -1 || event.request.method !== 'GET';

    if (isExternalApi) return;

    event.respondWith(
        caches.match(event.request).then(function (cached) {
            var fetchPromise = fetch(event.request).then(function (networkResponse) {
                if (networkResponse && networkResponse.status === 200) {
                    var clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
                }
                return networkResponse;
            }).catch(function () { return cached; });
            return cached || fetchPromise;
        })
    );
});

'use strict';
var App = {};

/* ============================================================
   CONSTANTS
   ============================================================ */
App.API_KEY = 'bd9461af224876674a8a2fd353a46ee4';
App.BASE_URL = 'https://api.themoviedb.org/3';
App.IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';
App.BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
App.NO_POSTER = 'https://placehold.co/500x750/222222/666666?text=No+Poster';

/* Best-effort client-reported IP (no backend available to read it server-side) */
App._clientIp = null;
App.fetchClientIp = function () {
    if (App._clientIp) return Promise.resolve(App._clientIp);
    return fetch('https://api.ipify.org?format=json')
        .then(function (r) { return r.json(); })
        .then(function (d) { App._clientIp = d.ip; return d.ip; })
        .catch(function () { return null; });
};
App.NO_PHOTO = 'https://placehold.co/150x225/222222/666666?text=No+Photo';
App.NO_STILL = 'https://placehold.co/300x170/222222/666666?text=No+Image';
App.CACHE_TTL = 8 * 60 * 1000;
App.HERO_ROTATE_MS = 6000;

/* ---------- LOGIN / DEVICE ACTIVITY LOGGING ---------- */
App._parseUserAgent = function (ua) {
    ua = ua || '';
    var device = 'Desktop';
    if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
    else if (/Mobi|Android/i.test(ua)) device = 'Mobile';

    var os = 'Unknown OS';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';

    var browser = 'Unknown Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    return { device: device, os: os, browser: browser };
};

/* Logs one entry per actual sign-in (not every page nav) - called from login.html
   right after a successful sign-in. */
App.logLoginEvent = function () {
    if (!App.Auth.currentUser || !App._db) return Promise.resolve();
    var info = App._parseUserAgent(navigator.userAgent);
    return App.fetchClientIp().then(function (ip) {
        return App._db.collection('loginLogs').add({
            uid: App.Auth.currentUser.uid,
            email: App.Auth.currentUser.email,
            ip: ip || null,
            device: info.device, os: info.os, browser: info.browser,
            userAgent: navigator.userAgent,
            ts: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).catch(function (e) { console.error('logLoginEvent failed', e); });
};
App._logLoginOncePerSession = function () {
    if (!App.Auth.currentUser) return;
    var key = 'tfrej_login_logged_' + App.Auth.currentUser.uid;
    if (sessionStorage.getItem(key)) return; // already logged this browser session
    sessionStorage.setItem(key, '1');
    App.logLoginEvent();
};

App.GENRES = [
    {label:'Action', m:28, t:10759}, {label:'Adventure', m:12, t:10759},
    {label:'Animation', m:16, t:16}, {label:'Comedy', m:35, t:35},
    {label:'Crime', m:80, t:80}, {label:'Documentary', m:99, t:99},
    {label:'Drama', m:18, t:18}, {label:'Family', m:10751, t:10751},
    {label:'Fantasy', m:14, t:10765}, {label:'History', m:36, t:null},
    {label:'Horror', m:27, t:null}, {label:'Mystery', m:9648, t:9648},
    {label:'Romance', m:10749, t:null}, {label:'Sci-Fi', m:878, t:10765},
    {label:'Thriller', m:53, t:null}, {label:'War', m:10752, t:10768},
    {label:'Western', m:37, t:37}
];

App.SECTION_CONFIG = {
    trending: { label: 'Trending VOD', mediaType: null, url: function (p) { return App.BASE_URL + '/trending/all/day?api_key=' + App.API_KEY + '&page=' + p; } },
    movie:    { label: 'Popular Movies', mediaType: 'movie', url: function (p) { return App.BASE_URL + '/discover/movie?api_key=' + App.API_KEY + '&sort_by=popularity.desc&page=' + p; } },
    tv:       { label: 'Popular TV Shows', mediaType: 'tv', url: function (p) { return App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&sort_by=popularity.desc&page=' + p; } },
    anime:    { label: 'Trending Anime', mediaType: 'tv', url: function (p) { return App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=' + p; } }
};

var qzzParams = '?primaryColor=6d28d9&secondaryColor=a2a2a2&iconColor=eefdec&icons=default&player=nf&title=true&poster=true&autoplay=true&nextbutton=true';
App.currentSeason = 1;
App.currentEpisode = 1;
App.SERVERS = {
    server1: { name: 'Server 1', movie: function(id){ return 'https://player.videasy.net/movie/'+id+'?color=6D28D9&overlay=true'; }, tv: function(id){ return 'https://player.videasy.net/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode+'?color=6D28D9&overlay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true'; } },
    server2: { name: 'Server 2', movie: function(id){ return 'https://vaplayer.ru/embed/movie/?tmdb='+id; }, tv: function(id){ return 'https://vaplayer.ru/embed/tv/?tmdb='+id+'&season='+App.currentSeason+'&episode='+App.currentEpisode; } },
    server3: { name: 'Server 3', movie: function(id){ return 'https://vidapi.qzz.io/movie/'+id+qzzParams; }, tv: function(id){ return 'https://vidapi.qzz.io/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode+qzzParams; } },
    server4: { name: 'Server 4', movie: function(id){ return 'https://vidapi.xyz/embed/movie/'+id; }, tv: function(id){ return 'https://vidapi.xyz/embed/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode; } },
    server5: { name: 'Server 5', movie: function(id){ return 'https://vixsrc.to/movie/'+id; }, tv: function(id){ return 'https://vixsrc.to/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode; } }
};
App.currentServerKey = localStorage.getItem('tfrej_server') || 'server1';
if (!App.SERVERS[App.currentServerKey]) App.currentServerKey = 'server1';

/* ============================================================
   THEME
   ============================================================ */
App.toggleTheme = function () {
    var isDark = document.documentElement.classList.contains('dark');
    if (isDark) { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
    else { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
};
if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');

/* ============================================================
   CACHE + FETCH (never hangs forever, avoids repeat TMDB calls)
   ============================================================ */
function cacheGet(key) {
    try {
        var raw = localStorage.getItem('tfrej_cache_' + key);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (Date.now() - obj.ts > App.CACHE_TTL) return null;
        return obj.data;
    } catch (e) { return null; }
}
function cacheSet(key, data) {
    try { localStorage.setItem('tfrej_cache_' + key, JSON.stringify({ ts: Date.now(), data: data })); }
    catch (e) {
        try {
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var k = localStorage.key(i);
                if (k && k.indexOf('tfrej_cache_') === 0) localStorage.removeItem(k);
            }
        } catch (e2) {}
    }
}
App.fetchJSON = function (url, ms) {
    var cached = cacheGet(url);
    if (cached) return Promise.resolve(cached);
    ms = ms || 10000;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return fetch(url, { signal: controller.signal })
        .then(function (res) { return res.json(); })
        .then(function (data) { cacheSet(url, data); return data; })
        .finally(function () { clearTimeout(timer); });
};

/* ============================================================
   TOAST (supports optional Undo-style action button)
   ============================================================ */
App.showToast = function (msg, actionLabel, actionFn) {
    var existing = document.getElementById('toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[1100] bg-black text-white text-sm font-bold pl-5 pr-2 py-2 rounded-full shadow-2xl border border-white/10 flex items-center gap-3';

    var msgSpan = document.createElement('span');
    msgSpan.innerText = msg;
    toast.appendChild(msgSpan);

    if (actionLabel && actionFn) {
        var btn = document.createElement('button');
        btn.innerText = actionLabel;
        btn.className = 'bg-primary hover:bg-primary/80 text-white text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0';
        btn.addEventListener('click', function () { actionFn(); toast.remove(); });
        toast.appendChild(btn);
    }
    document.body.appendChild(toast);
    var duration = (actionLabel && actionFn) ? 5000 : 2600;
    setTimeout(function () {
        if (!document.body.contains(toast)) return;
        toast.style.transition = 'opacity 0.4s ease';
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 400);
    }, duration);
};

/* ============================================================
   FIREBASE AUTH
   ============================================================ */
App.Auth = { currentUser: null, ready: false };
App._readyCallbacks = [];

App.initFirebase = function () {
    if (!window.firebase || !window.FIREBASE_CONFIG) {
        console.error('Firebase SDK or config missing - check script tags and assets/firebase-config.js.');
        return;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
        App._db = firebase.firestore();
        firebase.auth().onAuthStateChanged(function (user) {
            App.Auth.currentUser = user;
            var proceed = function () {
                App.Auth.ready = true;
                App._readyCallbacks.forEach(function (cb) { cb(user); });
                App._readyCallbacks = [];
                App.renderAuthNav();
            };
            if (user) {
                App.loadUserData().then(proceed);
            } else {
                App.userData = { watchlist: [], progress: {}, recent: [], blocked: false, blockedUntil: null, restrictedTitles: [] };
                proceed();
            }
        }, function (err) {
            console.error('onAuthStateChanged error', err);
            App.Auth.ready = true;
            App._readyCallbacks.forEach(function (cb) { cb(null); });
            App._readyCallbacks = [];
        });
    } catch (e) {
        console.error('Firebase init failed', e);
    }
};
App.onAuthReady = function (cb) {
    if (App.Auth.ready) cb(App.Auth.currentUser);
    else App._readyCallbacks.push(cb);
};
App.signUp = function (email, password) {
    return withTimeout(firebase.auth().createUserWithEmailAndPassword(email, password), 'Sign up');
};
App.signIn = function (email, password) {
    return withTimeout(firebase.auth().signInWithEmailAndPassword(email, password), 'Sign in');
};
function withTimeout(promise, label) {
    return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            reject({ code: 'timeout', message: label + ' timed out. Check your internet connection and that Email/Password sign-in is enabled in Firebase, then try again.' });
        }, 12000);
        promise.then(function (r) { if (settled) return; settled = true; clearTimeout(timer); resolve(r); })
               .catch(function (e) { if (settled) return; settled = true; clearTimeout(timer); reject(e); });
    });
}
App.signOutUser = function () {
    var uid = App.Auth.currentUser ? App.Auth.currentUser.uid : null;
    return firebase.auth().signOut().then(function () {
        if (uid) sessionStorage.removeItem('tfrej_profile_' + uid);
        App.activeProfileId = null;
        App.userData = { watchlist: [], progress: {}, recent: [], blocked: false, blockedUntil: null, restrictedTitles: [] };
        location.href = 'login.html';
    });
};

/* ---------- PROFILE: username, email, password ---------- */
App.setShowRecentlyViewed = function (show) {
    if (!App.Auth.currentUser) return Promise.reject({ code: 'no-user', message: 'Not signed in.' });
    App.userData.showRecentlyViewed = show;
    return App._db.collection('users').doc(App.Auth.currentUser.uid).set({ showRecentlyViewed: show }, { merge: true });
};

App.updateUsername = function (username) {
    if (!App.Auth.currentUser) return Promise.reject({ code: 'no-user', message: 'Not signed in.' });
    var uid = App.Auth.currentUser.uid;
    return withTimeout(
        App._db.collection('users').doc(uid).set({ username: username }, { merge: true }).then(function () {
            App.userData.username = username;
            return App.Auth.currentUser.updateProfile({ displayName: username })
                .catch(function (e) { console.error('displayName sync failed (non-fatal)', e); });
        }),
        'Update username'
    );
};

App.reauthenticate = function (currentPassword) {
    var user = App.Auth.currentUser;
    if (!user || !user.email) return Promise.reject({ code: 'no-user', message: 'Not signed in.' });
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    return user.reauthenticateWithCredential(cred);
};

App.changeEmail = function (currentPassword, newEmail) {
    return withTimeout(
        App.reauthenticate(currentPassword)
            .then(function () { return App.Auth.currentUser.updateEmail(newEmail); })
            .then(function () { return App._db.collection('users').doc(App.Auth.currentUser.uid).set({ email: newEmail }, { merge: true }); }),
        'Update email'
    );
};

App.changePassword = function (currentPassword, newPassword) {
    return withTimeout(
        App.reauthenticate(currentPassword)
            .then(function () { return App.Auth.currentUser.updatePassword(newPassword); }),
        'Update password'
    );
};

/* Every content page calls this right after initFirebase(). Shows a full-screen
   overlay (already in the page HTML, hidden as soon as we know the auth state)
   and redirects to login.html if nobody is signed in - the whole site requires
   an account before browsing, per site requirements. */
App.gateSiteAccess = function () {
    var settled = false;
    var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var overlay = document.getElementById('auth-gate-overlay');
        if (overlay) {
            overlay.innerHTML =
                '<div class="max-w-sm text-center px-6">' +
                    '<p class="text-red-400 font-bold mb-2">Couldn\'t verify your session.</p>' +
                    '<p class="text-zinc-400 text-sm mb-5">This usually means Firebase didn\'t load - check your internet connection, disable any ad blocker for this site, or double-check assets/firebase-config.js.</p>' +
                    '<button onclick="location.reload()" class="bg-primary text-white font-bold px-6 py-2.5 rounded-xl">Retry</button>' +
                '</div>';
        }
    }, 8000);

    App.onAuthReady(function (user) {
        if (settled) return; // timeout already fired and rendered the error state
        settled = true;
        clearTimeout(timer);
        var overlay = document.getElementById('auth-gate-overlay');
        if (!user) {
            var returnTo = encodeURIComponent(location.pathname + location.search);
            location.href = 'login.html?return=' + returnTo;
            return;
        }
        if (user.isAnonymous) {
            // Anonymous sessions only exist for joining watch parties as a guest -
            // they should never be treated as a real site account. Without this
            // check, a guest navigating to a normal page after leaving a party
            // would silently get a blank account auto-created for them.
            firebase.auth().signOut().finally(function () {
                location.href = 'login.html';
            });
            return;
        }
        App._db.collection('deletedAccounts').doc(user.uid).get().then(function (tombstone) {
            if (tombstone.exists) {
                firebase.auth().signOut().finally(function () {
                    location.href = 'login.html?deleted=1';
                });
                return;
            }
            App._continueGateAfterDeletionCheck(overlay);
        }).catch(function () {
            // If this check itself fails (e.g. rules not yet updated), fail open rather
            // than lock everyone out - the normal approved/banned checks still apply.
            App._continueGateAfterDeletionCheck(overlay);
        });
    });
};
App._continueGateAfterDeletionCheck = function (overlay) {
        if (!App.userData.approved) {
            firebase.auth().signOut().finally(function () {
                location.href = 'pending-approval.html';
            });
            return;
        }
        if (App.isCurrentlyBanned(App.userData)) {
            var untilText = App.userData.blockedUntil ? '&until=' + encodeURIComponent(fsDateToIso(App.userData.blockedUntil)) : '&forever=1';
            var reasonText = App.userData.banReason ? '&reason=' + encodeURIComponent(App.userData.banReason) : '';
            firebase.auth().signOut().finally(function () {
                location.href = 'login.html?blocked=1' + untilText + reasonText;
            });
            return;
        }
        if (overlay) overlay.remove();
        App.maybeShowAdminLink();
        App._logLoginOncePerSession();

        // Profile picker gate - runs only once sign-in/approval/ban checks all pass.
        if (!App.activeProfileId && location.pathname.indexOf('profiles.html') === -1) {
            console.warn('No active profile found - redirecting to profiles.html. Debug info:', {
                sessionStorageValue: App.Auth.currentUser ? sessionStorage.getItem('tfrej_profile_' + App.Auth.currentUser.uid) : null,
                knownProfileIds: (App._rawProfiles || []).map(function (p) { return p.id; })
            });
            location.href = 'profiles.html';
        } else if (App.activeProfileId) {
            App.checkForNewEpisodes();
        }
};
function fsDateToIso(ts) {
    try { var d = ts.toDate ? ts.toDate() : new Date(ts); return d.toISOString(); } catch (e) { return ''; }
}
/* True if the user is blocked right now. A permanent ban has blockedUntil
   unset; a timed ban auto-expires once blockedUntil is in the past. */
App.isCurrentlyBanned = function (u) {
    if (!u || !u.blocked) return false;
    if (!u.blockedUntil) return true; // forever
    var untilMs;
    try { untilMs = u.blockedUntil.toDate ? u.blockedUntil.toDate().getTime() : new Date(u.blockedUntil).getTime(); }
    catch (e) { return true; }
    return untilMs > Date.now();
};

/* ============================================================
   EMAILJS (no backend needed - sends the two approval-flow emails)
   ============================================================ */
App.EMAILJS_PUBLIC_KEY = '0tUC70JTDh4REwT8E';
App.EMAILJS_SERVICE_ID = 'service_pe3p5jq';
App.EMAILJS_TEMPLATE_ADMIN_NOTIFY = 'template_w3aqipm';
App.EMAILJS_TEMPLATE_USER_APPROVED = 'template_oaa6vzz';

App._emailjsInit = false;
App.initEmailJS = function () {
    if (window.emailjs && !App._emailjsInit) {
        emailjs.init({ publicKey: App.EMAILJS_PUBLIC_KEY });
        App._emailjsInit = true;
    }
};
App._siteBaseUrl = function () {
    return location.origin + location.pathname.replace(/[^/]+$/, '');
};
App.sendAdminApprovalEmail = function (userEmail) {
    if (!window.emailjs) return Promise.resolve();
    return emailjs.send(App.EMAILJS_SERVICE_ID, App.EMAILJS_TEMPLATE_ADMIN_NOTIFY, {
        user_email: userEmail,
        signup_date: new Date().toLocaleString(),
        approve_link: App._siteBaseUrl() + 'admin-users.html'
    }).catch(function (e) { console.error('admin notify email failed', e); });
};
App.sendUserApprovedEmail = function (userEmail) {
    if (!window.emailjs) return Promise.resolve();
    return emailjs.send(App.EMAILJS_SERVICE_ID, App.EMAILJS_TEMPLATE_USER_APPROVED, {
        to_email: userEmail,
        login_link: App._siteBaseUrl() + 'login.html'
    }).catch(function (e) { console.error('user approved email failed', e); });
};

/* ============================================================
   ADMIN
   ============================================================ */
App._isAdmin = null; // null = unknown yet, true/false once checked
App.checkIsAdmin = function () {
    if (App._isAdmin !== null) return Promise.resolve(App._isAdmin);
    if (!App.Auth.currentUser) return Promise.resolve(false);
    return App._db.collection('admins').doc(App.Auth.currentUser.uid).get()
        .then(function (doc) { App._isAdmin = doc.exists; return App._isAdmin; })
        .catch(function (e) {
            console.error('checkIsAdmin failed - likely a Firestore rules issue:', e);
            App._isAdmin = false;
            return false;
        });
};
App.maybeShowAdminLink = function () {
    App.checkIsAdmin().then(function (isAdmin) {
        if (!isAdmin) return;
        var desk = document.getElementById('nav-admin-slot');
        var mob = document.getElementById('mobile-admin-slot');
        if (desk) desk.innerHTML = '<a href="admin.html" class="hover:text-primary transition-colors focusable rounded">Admin</a>';
        if (mob) mob.innerHTML = '<a href="admin.html" class="block px-6 py-3.5 text-sm font-bold text-primary hover:bg-primary hover:text-white transition-colors border-b border-black/5 dark:border-white/5">Admin Dashboard</a>';
    });
};
/* Call at the top of admin pages instead of gateSiteAccess() - requires both
   sign-in AND an admins/{uid} doc to exist. */
App.gateAdminAccess = function (onGranted) {
    var settled = false;
    var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var overlay = document.getElementById('auth-gate-overlay');
        if (overlay) overlay.innerHTML =
            '<div class="max-w-sm text-center px-6"><p class="text-red-400 font-bold mb-2">Couldn\'t verify your session.</p>' +
            '<button onclick="location.reload()" class="bg-primary text-white font-bold px-6 py-2.5 rounded-xl">Retry</button></div>';
    }, 8000);

    App.onAuthReady(function (user) {
        if (!user) { location.href = 'login.html'; return; }
        App.checkIsAdmin().then(function (isAdmin) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (!isAdmin) {
                App.showToast('You are not authorized to view this page.');
                setTimeout(function () { location.href = 'index.html'; }, 800);
                return;
            }
            var overlay = document.getElementById('auth-gate-overlay');
            if (overlay) overlay.remove();
            if (typeof onGranted === 'function') onGranted();
        });
    });
};

/* ============================================================
   LOGGING (feeds the admin dashboard - watch activity & search terms)
   ============================================================ */
App._loggedSearches = {};
App.logWatchEvent = function (item, mediaType, season, episode) {
    if (!App.Auth.currentUser || !App._db) return;
    App.fetchClientIp().then(function (ip) {
        App._db.collection('watchLogs').add({
            uid: App.Auth.currentUser.uid,
            email: App.Auth.currentUser.email,
            itemId: String(item.id),
            mediaType: mediaType,
            title: item.title || item.name || '',
            posterPath: item.poster_path || null,
            season: season || null,
            episode: episode || null,
            ip: ip || null,
            ts: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function (e) { console.error('logWatchEvent failed', e); });
    });
};
App.logSearch = function (query) {
    if (!App.Auth.currentUser || !App._db) return;
    var key = query.trim().toLowerCase();
    if (!key || App._loggedSearches[key]) return; // once per distinct query per page session
    App._loggedSearches[key] = true;
    App._db.collection('searchLogs').add({
        uid: App.Auth.currentUser.uid,
        email: App.Auth.currentUser.email,
        query: query.trim(),
        ts: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (e) { console.error('logSearch failed', e); });
};

/* Redirects to login, preserving where the person was headed.
   Call this before any "must be signed in" action (Watch Now, etc). */
App.requireAuth = function () {
    if (App.Auth.currentUser) return true;
    var returnTo = encodeURIComponent(location.pathname + location.search);
    App.showToast('Please sign in to continue.');
    setTimeout(function () { location.href = 'login.html?return=' + returnTo; }, 700);
    return false;
};

/* ============================================================
   USER DATA (Firestore-backed: watchlist, continue-watching progress, recently viewed)
   ============================================================ */
App.MAX_PROFILES = 5;
App.DEFAULT_AVATARS = ['🎬', '🍿', '👾', '🚀', '🦁', '🐉', '🎮', '⚡', '🌟', '🦊', '🐺', '🎨'];
App.AVATAR_COLORS = {
    '🎬': '#dc2626', '🍿': '#ea580c', '👾': '#7c3aed', '🚀': '#0284c7',
    '🦁': '#d97706', '🐉': '#16a34a', '🎮': '#db2777', '⚡': '#ca8a04',
    '🌟': '#6d28d9', '🦊': '#c2410c', '🐺': '#475569', '🎨': '#0891b2'
};
App.avatarColorFor = function (emoji) { return App.AVATAR_COLORS[emoji] || '#6d28d9'; };
App.AVATAR_COLORS = ['#6d28d9', '#dc2626', '#0891b2', '#ca8a04', '#16a34a', '#db2777', '#4f46e5', '#ea580c'];

App.userData = { watchlist: [], progress: {}, recent: [], blocked: false, blockedUntil: null, restrictedTitles: [], approved: true };
App._userDataLoaded = false;
App._rawProfiles = [];      // profile metadata: [{id, name, avatar, isKids, pin, createdAt}]
App._rawProfileData = {};   // per-profile data: { [profileId]: {watchlist, progress, recent} }
App.activeProfileId = null;

App.loadUserData = function () {
    if (!App.Auth.currentUser) return Promise.resolve(App.userData);
    var ref = App._db.collection('users').doc(App.Auth.currentUser.uid);
    return ref.get()
        .then(function (doc) {
            var d = doc.exists ? doc.data() : {};
            App.userData.blocked = !!d.blocked;
            App.userData.blockedUntil = d.blockedUntil || null;
            App.userData.banReason = d.banReason || null;
            App.userData.restrictedTitles = d.restrictedTitles || [];
            App.userData.username = d.username || '';
            App.userData.showRecentlyViewed = d.showRecentlyViewed !== false;
            App.userData.approved = d.approved !== false; // undefined (legacy accounts) or true => approved

            var profiles = d.profiles;
            var profileData = d.profileData || {};
            var needsMigration = !profiles || !profiles.length;
            if (needsMigration) {
                // First time this account sees the profile system - turn their existing
                // single account into "Profile 1" so nothing they had is lost.
                var legacyId = 'p1';
                profiles = [{ id: legacyId, name: d.username || 'Profile 1', avatar: App.DEFAULT_AVATARS[0], isKids: false, pin: null, createdAt: Date.now() }];
                profileData[legacyId] = { watchlist: d.watchlist || [], progress: d.progress || {}, recent: d.recent || [] };
            }
            App._rawProfiles = profiles;
            App._rawProfileData = profileData;

            var savedProfileId = sessionStorage.getItem('tfrej_profile_' + App.Auth.currentUser.uid);
            App.activeProfileId = (savedProfileId && profiles.some(function (p) { return p.id === savedProfileId; })) ? savedProfileId : null;
            App._applyActiveProfileData();

            App._userDataLoaded = true;

            var writePayload = {
                email: App.Auth.currentUser.email,
                createdAt: doc.exists && d.createdAt ? d.createdAt : firebase.firestore.FieldValue.serverTimestamp(),
                lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (needsMigration) { writePayload.profiles = profiles; writePayload.profileData = profileData; }
            App.fetchClientIp().then(function (ip) {
                writePayload.lastIp = ip || null;
                ref.set(writePayload, { merge: true }).catch(function (e) { console.error('profile update failed', e); });
            });

            return App.userData;
        })
        .catch(function (e) { console.error('loadUserData failed', e); App._userDataLoaded = true; return App.userData; });
};

App._applyActiveProfileData = function () {
    var pd = (App.activeProfileId && App._rawProfileData[App.activeProfileId]) || {};
    App.userData.watchlist = pd.watchlist || [];
    App.userData.progress = pd.progress || {};
    App.userData.recent = pd.recent || [];
};

App.saveUserData = function () {
    if (!App.Auth.currentUser) return Promise.resolve();
    if (App.activeProfileId) {
        App._rawProfileData[App.activeProfileId] = {
            watchlist: App.userData.watchlist, progress: App.userData.progress, recent: App.userData.recent
        };
    }
    return App._db.collection('users').doc(App.Auth.currentUser.uid).set({
        blocked: App.userData.blocked, blockedUntil: App.userData.blockedUntil, banReason: App.userData.banReason,
        restrictedTitles: App.userData.restrictedTitles, username: App.userData.username,
        showRecentlyViewed: App.userData.showRecentlyViewed,
        profiles: App._rawProfiles, profileData: App._rawProfileData
    }, { merge: true }).catch(function (e) { console.error('saveUserData failed', e); });
};

/* ---------- PROFILES ---------- */
/* ---------- KIDS MODE CONTENT FILTERING ----------
   Best-effort only: TMDB doesn't expose reliable per-item maturity ratings on
   list/search endpoints, so this leans on genre tags. Requires the Family tag
   specifically - Animation alone isn't a safe enough signal on its own, since
   plenty of mature content (adult animation, violent anime, etc.) carries
   that tag too. This is intentionally conservative: some legitimate kids'
   content without an explicit Family tag may get excluded too, which is the
   safer failure mode for a kids profile. */
App.KIDS_SAFE_GENRES = [10751]; // Family
App.KIDS_EXCLUDE_GENRES = [27, 53, 80, 10752, 9648, 18]; // Horror, Thriller, Crime, War, Mystery, Drama
App.filterKidsSafe = function (results) {
    if (!App.isKidsProfile()) return results;
    return results.filter(function (item) {
        var ids = item.genre_ids || (item.genres ? item.genres.map(function (g) { return g.id; }) : []);
        var hasSafe = ids.some(function (g) { return App.KIDS_SAFE_GENRES.indexOf(g) > -1; });
        var hasExcluded = ids.some(function (g) { return App.KIDS_EXCLUDE_GENRES.indexOf(g) > -1; });
        return hasSafe && !hasExcluded;
    });
};

/* ============================================================
   NOTIFICATIONS ("bell" system) - in-app only, checked when the app is
   actively open (no true push is possible without a backend server -
   see chat for why). Stored per profile, same as watch data.
   ============================================================ */
App.getNotifications = function () {
    var profile = App.getActiveProfile();
    var pd = profile && App._rawProfileData[profile.id];
    return (pd && pd.notifications) ? pd.notifications : [];
};
App.addNotification = function (notif) {
    var profile = App.getActiveProfile();
    if (!profile || !App.Auth.currentUser) return;
    var pd = App._rawProfileData[profile.id] = App._rawProfileData[profile.id] || { watchlist: [], progress: {}, recent: [] };
    pd.notifications = pd.notifications || [];
    var alreadyExists = pd.notifications.some(function (n) { return n.itemId === notif.itemId && n.message === notif.message; });
    if (alreadyExists) return;
    pd.notifications.unshift({
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        itemId: notif.itemId, mediaType: notif.mediaType, title: notif.title,
        posterPath: notif.posterPath || null, message: notif.message,
        read: false, ts: Date.now()
    });
    if (pd.notifications.length > 40) pd.notifications = pd.notifications.slice(0, 40);
    App._db.collection('users').doc(App.Auth.currentUser.uid).set({ profileData: App._rawProfileData }, { merge: true })
        .then(function () { App.renderNotificationBell(); })
        .catch(function (e) { console.error('addNotification failed', e); });
};
App.markNotificationRead = function (id) {
    var profile = App.getActiveProfile();
    if (!profile) return;
    var pd = App._rawProfileData[profile.id];
    if (!pd || !pd.notifications) return;
    var n = pd.notifications.filter(function (x) { return x.id === id; })[0];
    if (n) n.read = true;
    App._db.collection('users').doc(App.Auth.currentUser.uid).set({ profileData: App._rawProfileData }, { merge: true }).catch(function () {});
    App.renderNotificationBell();
};
App.markAllNotificationsRead = function () {
    var profile = App.getActiveProfile();
    if (!profile) return;
    var pd = App._rawProfileData[profile.id];
    if (!pd || !pd.notifications) return;
    pd.notifications.forEach(function (n) { n.read = true; });
    App._db.collection('users').doc(App.Auth.currentUser.uid).set({ profileData: App._rawProfileData }, { merge: true }).catch(function () {});
    App.renderNotificationBell();
};

/* Checks shows in Continue Watching for episodes newer than what's been
   watched. Runs once per browser session to keep TMDB calls reasonable. */
App.checkForNewEpisodes = function () {
    if (sessionStorage.getItem('tfrej_notif_checked')) return;
    sessionStorage.setItem('tfrej_notif_checked', '1');

    // Continue Watching + Watchlist TV shows - check for new episodes
    var progressShows = Object.keys(App.userData.progress || {}).map(function (id) { return App.userData.progress[id]; }).filter(function (p) { return p.media_type === 'tv'; });
    var watchlistShows = (App.userData.watchlist || []).filter(function (w) { return (w.media_type || w.mediaType) === 'tv'; });
    var seenTvIds = {};
    progressShows.forEach(function (p) { seenTvIds[p.id] = true; });
    watchlistShows.forEach(function (w) {
        if (seenTvIds[w.id]) return; // already covered via progress check
        seenTvIds[w.id] = true;
        App.fetchJSON(App.BASE_URL + '/tv/' + w.id + '?api_key=' + App.API_KEY).then(function (data) {
            var last = data.last_episode_to_air;
            if (!last) return;
            App.addNotification({
                itemId: w.id, mediaType: 'tv', title: data.name || w.title, posterPath: data.poster_path,
                message: 'New episode out: Season ' + last.season_number + ', Episode ' + last.episode_number
            });
        }).catch(function () {});
    });
    Object.keys(seenTvIds).forEach(function (id) {
        var p = progressShows.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!p) return;
        App.fetchJSON(App.BASE_URL + '/tv/' + p.id + '?api_key=' + App.API_KEY).then(function (data) {
            var last = data.last_episode_to_air;
            if (!last) return;
            var isNewer = last.season_number > p.season || (last.season_number === p.season && last.episode_number > p.episode);
            if (isNewer) {
                App.addNotification({
                    itemId: p.id, mediaType: 'tv', title: data.name || p.title, posterPath: data.poster_path,
                    message: 'New episode: Season ' + last.season_number + ', Episode ' + last.episode_number
                });
            }
        }).catch(function () {});
    });

    // Watchlist movies - notify once they've actually been released
    var watchlistMovies = (App.userData.watchlist || []).filter(function (w) { return (w.media_type || w.mediaType) === 'movie'; });
    watchlistMovies.forEach(function (w) {
        App.fetchJSON(App.BASE_URL + '/movie/' + w.id + '?api_key=' + App.API_KEY).then(function (data) {
            if (!data.release_date) return;
            var releaseDate = new Date(data.release_date + 'T00:00:00');
            if (releaseDate <= new Date()) {
                App.addNotification({
                    itemId: w.id, mediaType: 'movie', title: data.title || w.title, posterPath: data.poster_path,
                    message: 'Now available to watch'
                });
            }
        }).catch(function () {});
    });

    App._checkComeBackNudge();
};

/* Gentle "pick up where you left off" nudge if it's been a few days since any
   activity and something is genuinely still in progress. Once per calendar
   day at most, so it never feels spammy. */
App._checkComeBackNudge = function () {
    var progress = App.userData.progress || {};
    var entries = Object.keys(progress).map(function (id) { return progress[id]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!entries.length) return;
    var mostRecent = entries[0];
    var daysSince = (Date.now() - (mostRecent.ts || 0)) / (1000 * 60 * 60 * 24);
    if (daysSince < 3) return;

    var todayKey = 'tfrej_comeback_nudge_' + new Date().toISOString().substring(0, 10);
    if (localStorage.getItem(todayKey)) return;
    localStorage.setItem(todayKey, '1');

    App.addNotification({
        itemId: mostRecent.id, mediaType: mostRecent.media_type, title: mostRecent.title, posterPath: mostRecent.poster_path,
        message: 'Pick up where you left off'
    });
};

App.renderNotificationBell = function () {
    var badge = document.getElementById('notif-badge');
    if (!badge) return;
    var unread = App.getNotifications().filter(function (n) { return !n.read; }).length;
    if (unread > 0) { badge.classList.remove('hidden'); badge.innerText = unread > 9 ? '9+' : String(unread); }
    else badge.classList.add('hidden');
};

App._notifTimeAgo = function (ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

App._wireNotificationBell = function () {
    var btn = document.getElementById('notif-bell-btn');
    var panel = document.getElementById('notif-panel');
    if (!btn || !panel) return;

    var renderPanel = function () {
        var notifs = App.getNotifications();
        if (!notifs.length) {
            panel.innerHTML = '<div class="p-6 text-center text-sm text-zinc-500">No notifications yet.</div>';
            return;
        }
        panel.innerHTML =
            '<div class="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">' +
                '<span class="font-bold text-sm text-black dark:text-white">Notifications</span>' +
                '<button id="notif-mark-all-btn" class="text-xs font-bold text-primary hover:underline">Mark all read</button>' +
            '</div>' +
            '<div class="max-h-96 overflow-y-auto custom-scrollbar">' +
                notifs.map(function (n) {
                    var poster = n.posterPath ? (App.IMG_BASE_URL + n.posterPath) : App.NO_POSTER;
                    return '<a href="title.html?type=' + n.mediaType + '&id=' + n.itemId + '" class="notif-item flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/10 border-b border-black/5 dark:border-white/5 last:border-0 ' + (n.read ? 'opacity-60' : '') + '" data-id="' + n.id + '">' +
                        '<img src="' + poster + '" class="w-12 h-16 object-cover rounded-lg flex-shrink-0 bg-zinc-200 dark:bg-zinc-800">' +
                        '<div class="min-w-0 flex-1">' +
                            '<p class="text-sm font-bold text-black dark:text-white truncate">' + n.title + '</p>' +
                            '<p class="text-xs text-zinc-500 truncate">' + n.message + '</p>' +
                            '<p class="text-[10px] text-zinc-400 mt-0.5">' + App._notifTimeAgo(n.ts) + '</p>' +
                        '</div>' +
                        (n.read ? '' : '<span class="w-2 h-2 rounded-full bg-primary flex-shrink-0"></span>') +
                    '</a>';
                }).join('') +
            '</div>';

        var markAllBtn = document.getElementById('notif-mark-all-btn');
        if (markAllBtn) markAllBtn.addEventListener('click', function (e) { e.stopPropagation(); App.markAllNotificationsRead(); renderPanel(); });
        panel.querySelectorAll('.notif-item').forEach(function (item) {
            item.addEventListener('click', function () { App.markNotificationRead(item.getAttribute('data-id')); });
        });
    };

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        if (willOpen) renderPanel();
    });
    document.addEventListener('click', function (e) {
        if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) panel.classList.add('hidden');
    });
};

/* ---------- "CURRENTLY WATCHING" PRESENCE (lightweight, no backend needed) ---------- */
/* ---------- WATCH TOGETHER ---------- */
App.showWatchTogetherChoice = function () {
    if (!App.requireAuth() || !App.currentItemData) return;
    var overlay = document.createElement('div');
    overlay.id = 'wt-choice-overlay';
    overlay.className = 'fixed inset-0 z-[1500] bg-black/80 flex items-center justify-center p-4';
    overlay.innerHTML =
        '<div class="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full">' +
            '<h2 class="text-xl font-black text-black dark:text-white mb-1">Watch Together</h2>' +
            '<p class="text-sm text-zinc-500 mb-5">Choose how you want to watch with friends.</p>' +
            '<div class="flex flex-col gap-3">' +
                '<button id="wt-choice-room" class="text-left p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-primary transition-colors">' +
                    '<span class="block font-bold text-black dark:text-white">🔗 Watch Room</span>' +
                    '<span class="block text-xs text-zinc-500 mt-1">Everyone plays it on their own device from the same starting point. Live chat and reactions. Most reliable.</span>' +
                '</button>' +
                '<button id="wt-choice-stream" class="text-left p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-primary transition-colors">' +
                    '<span class="block font-bold text-black dark:text-white">📡 Live Stream (truly synced)</span>' +
                    '<span class="block text-xs text-zinc-500 mt-1">You share your screen and everyone watches your exact stream in real time - genuinely frame-by-frame together. Quality depends on your internet upload speed, and you need to keep this tab open and shared.</span>' +
                '</button>' +
            '</div>' +
            '<button id="wt-choice-cancel" class="mt-4 text-sm font-bold text-zinc-500 hover:text-black dark:hover:text-white">Cancel</button>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('wt-choice-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById('wt-choice-room').addEventListener('click', function () { overlay.remove(); App.createWatchParty('room'); });
    document.getElementById('wt-choice-stream').addEventListener('click', function () { overlay.remove(); App.createWatchParty('stream'); });
};

App.createWatchParty = function (mode) {
    if (!App.requireAuth() || !App.currentItemData) return;
    var roomId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var hostName = (App.userData && App.userData.username) ? App.userData.username : App.Auth.currentUser.email;
    App._db.collection('watchParties').doc(roomId).set({
        mode: mode,
        hostUid: App.Auth.currentUser.uid,
        hostName: hostName,
        itemId: App.currentItemData.id,
        mediaType: App.currentMediaType,
        title: App.currentItemData.title || App.currentItemData.name || '',
        posterPath: App.currentItemData.poster_path || null,
        season: App.currentMediaType === 'tv' ? (App.currentSeason || 1) : null,
        episode: App.currentMediaType === 'tv' ? (App.currentEpisode || 1) : null,
        serverKey: App.currentServerKey || 'server1',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
        location.href = App._siteBaseUrl() + 'party.html?room=' + roomId + '&host=1';
    }).catch(function (e) {
        console.error('createWatchParty failed', e);
        App.showToast('Failed to create the watch party. Check the console for details.');
    });
};

App.updatePresence = function (item, mediaType) {
    if (!App.Auth.currentUser || !App._db) return;
    var name = (App.userData && App.userData.username) ? App.userData.username : App.Auth.currentUser.email;
    App._db.collection('presence').doc(App.Auth.currentUser.uid).set({
        username: name,
        title: item.title || item.name || '',
        posterPath: item.poster_path || null,
        mediaType: mediaType,
        itemId: item.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (e) { console.error('updatePresence failed', e); });
};

App.getActiveProfile = function () {
    return App._rawProfiles.filter(function (p) { return p.id === App.activeProfileId; })[0] || null;
};
App.isKidsProfile = function () {
    var p = App.getActiveProfile();
    return !!(p && p.isKids);
};
/* Built from the same App.GENRES list used on the homepage pills, so every
   genre available for browsing is also available to hide. Each entry covers
   both the movie-genre and TV-genre IDs for that label, since TMDB uses
   different IDs for the same concept across movies vs TV in a few cases
   (e.g. Action = 28 for movies, 10759/"Action & Adventure" for TV). */
App.HIDABLE_GENRES = App.GENRES.map(function (g) {
    var ids = [];
    if (g.m) ids.push(g.m);
    if (g.t && ids.indexOf(g.t) === -1) ids.push(g.t);
    return { name: g.label, ids: ids };
});
App.filterHiddenGenres = function (results) {
    var p = App.getActiveProfile();
    var hidden = (p && p.hiddenGenres) || [];
    if (!hidden.length) return results;
    return results.filter(function (item) {
        var ids = item.genre_ids || (item.genres ? item.genres.map(function (g) { return g.id; }) : []);
        return !ids.some(function (g) { return hidden.indexOf(g) > -1; });
    });
};
/* Combines kids-safety filtering with this profile's own "hide this genre"
   preferences - use this everywhere content gets filtered, instead of
   calling filterKidsSafe directly. */
/* ---------- LIKE/DISLIKE FEEDBACK (per profile) ---------- */
App.setFeedback = function (item, mediaType, value) {
    var profile = App.getActiveProfile();
    if (!profile) return Promise.reject({ message: 'No active profile.' });
    var pd = App._rawProfileData[profile.id] = App._rawProfileData[profile.id] || { watchlist: [], progress: {}, recent: [] };
    pd.feedback = pd.feedback || {};
    if (pd.feedback[item.id] && pd.feedback[item.id].value === value) {
        delete pd.feedback[item.id]; // clicking the same reaction again clears it
    } else {
        pd.feedback[item.id] = {
            value: value, mediaType: mediaType,
            genreIds: (item.genres || []).map(function (g) { return g.id; }),
            title: item.title || item.name || '', ts: Date.now()
        };
    }
    return App._db.collection('users').doc(App.Auth.currentUser.uid).set({ profileData: App._rawProfileData }, { merge: true });
};
App.getFeedback = function (itemId) {
    var profile = App.getActiveProfile();
    var pd = profile && App._rawProfileData[profile.id];
    return (pd && pd.feedback && pd.feedback[itemId]) ? pd.feedback[itemId].value : null;
};
App.getRecommendedGenre = function () {
    var counts = {};
    // Primary signal: things actually watched (Continue Watching progress)
    Object.keys(App.userData.progress || {}).forEach(function (id) {
        (App.userData.progress[id].genreIds || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 2; });
    });
    // Secondary signal: explicit likes
    var profile = App.getActiveProfile();
    var pd = profile && App._rawProfileData[profile.id];
    if (pd && pd.feedback) {
        Object.keys(pd.feedback).forEach(function (id) {
            var f = pd.feedback[id];
            if (f.value !== 'like') return;
            (f.genreIds || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
        });
    }
    var topId = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    return topId ? Number(topId) : null;
};

App.applyProfileFilters = function (results) {
    return App.filterHiddenGenres(App.filterKidsSafe(results));
};
App.addProfile = function (name, avatar, isKids, pin, hiddenGenres) {
    if (App._rawProfiles.length >= App.MAX_PROFILES) return Promise.reject({ message: 'Maximum ' + App.MAX_PROFILES + ' profiles allowed.' });
    var id = 'p' + Date.now();
    App._rawProfiles.push({ id: id, name: name, avatar: avatar, isKids: !!isKids, pin: pin || null, hiddenGenres: hiddenGenres || [], createdAt: Date.now() });
    App._rawProfileData[id] = { watchlist: [], progress: {}, recent: [] };
    return App._db.collection('users').doc(App.Auth.currentUser.uid)
        .set({ profiles: App._rawProfiles, profileData: App._rawProfileData }, { merge: true })
        .then(function () { return id; });
};
App.editProfile = function (id, changes) {
    var p = App._rawProfiles.filter(function (x) { return x.id === id; })[0];
    if (!p) return Promise.reject({ message: 'Profile not found.' });
    Object.assign(p, changes);
    return App._db.collection('users').doc(App.Auth.currentUser.uid).set({ profiles: App._rawProfiles }, { merge: true });
};
App.deleteProfile = function (id) {
    if (App._rawProfiles.length <= 1) return Promise.reject({ message: "Can't delete your only profile." });
    App._rawProfiles = App._rawProfiles.filter(function (x) { return x.id !== id; });
    delete App._rawProfileData[id];
    return App._db.collection('users').doc(App.Auth.currentUser.uid)
        .set({ profiles: App._rawProfiles, profileData: App._rawProfileData }, { merge: true });
};
App.selectProfile = function (id) {
    App.activeProfileId = id;
    sessionStorage.setItem('tfrej_profile_' + App.Auth.currentUser.uid, id);
    App._applyActiveProfileData();
};
App.switchProfile = function () {
    App.activeProfileId = null;
    sessionStorage.removeItem('tfrej_profile_' + App.Auth.currentUser.uid);
    location.href = 'profiles.html';
};

App.toggleWatchlist = function (item, mediaType) {
    if (!App.requireAuth()) return;
    var exists = App.userData.watchlist.some(function (i) { return String(i.id) === String(item.id); });
    if (exists) App.userData.watchlist = App.userData.watchlist.filter(function (i) { return String(i.id) !== String(item.id); });
    else App.userData.watchlist.unshift({ id: item.id, media_type: mediaType, title: item.title || item.name, poster_path: item.poster_path });
    App.saveUserData();
};
App.removeFromWatchlist = function (id) {
    var idx = -1;
    for (var i = 0; i < App.userData.watchlist.length; i++) { if (String(App.userData.watchlist[i].id) === String(id)) { idx = i; break; } }
    var removed = idx > -1 ? App.userData.watchlist[idx] : null;
    App.userData.watchlist = App.userData.watchlist.filter(function (i) { return String(i.id) !== String(id); });
    App.saveUserData();
    if (removed) {
        App.showToast('Removed from My List', 'Undo', function () {
            App.userData.watchlist.splice(Math.min(idx, App.userData.watchlist.length), 0, removed);
            App.saveUserData();
            if (typeof App._onListsChanged === 'function') App._onListsChanged();
        });
    }
    if (typeof App._onListsChanged === 'function') App._onListsChanged();
};
App.saveProgress = function (item, mediaType, season, episode, progressPercent) {
    if (!App.requireAuth()) return;
    var existing = App.userData.progress[item.id] || {};
    var resolvedPercent = (typeof progressPercent === 'number') ? progressPercent
        : (typeof existing.progressPercent === 'number' ? existing.progressPercent : null);
    App.userData.progress[item.id] = {
        id: item.id, title: item.name || item.title, poster_path: item.poster_path,
        media_type: mediaType, season: season || null, episode: episode || null,
        genreIds: (item.genres || []).map(function (g) { return g.id; }),
        progressPercent: resolvedPercent,
        ts: Date.now()
    };
    App.saveUserData();
};
App.removeFromContinue = function (id) {
    var removed = App.userData.progress[id] || null;
    delete App.userData.progress[id];
    App.saveUserData();
    if (removed) {
        App.showToast('Removed from Continue Watching', 'Undo', function () {
            App.userData.progress[id] = removed;
            App.saveUserData();
            if (typeof App._onListsChanged === 'function') App._onListsChanged();
        });
    }
    if (typeof App._onListsChanged === 'function') App._onListsChanged();
};
App.saveRecentlyViewed = function (item, mediaType) {
    if (!App.Auth.currentUser) return;
    App.userData.recent = App.userData.recent.filter(function (i) { return String(i.id) !== String(item.id); });
    App.userData.recent.unshift({ id: item.id, media_type: mediaType, title: item.title || item.name, poster_path: item.poster_path, ts: Date.now() });
    if (App.userData.recent.length > 20) App.userData.recent = App.userData.recent.slice(0, 20);
    App.saveUserData();
};

/* ============================================================
   NAV + FOOTER (injected into #nav-root / #footer-root on every page)
   ============================================================ */
App.selfDeleteAccount = function (currentPassword) {
    return App.reauthenticate(currentPassword).then(function () {
        var uid = App.Auth.currentUser.uid;
        var email = App.Auth.currentUser.email;
        return App._db.collection('deletedAccounts').doc(uid).set({
            email: email, selfDeleted: true, deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () { return App._db.collection('users').doc(uid).delete(); })
          .then(function () { return firebase.auth().signOut(); });
    });
};

App.registerServiceWorker = function () {
    if (App._swRegistered || !('serviceWorker' in navigator)) return;
    App._swRegistered = true;
    var swPath = location.pathname.replace(/[^/]*$/, '') + 'sw.js';
    navigator.serviceWorker.register(swPath).catch(function (e) { console.error('Service worker registration failed', e); });
};

App.injectPwaManifest = function () {
    // The manifest itself is now a real static manifest.json linked directly in
    // every page's <head> - required for Android/APK tooling (like PWABuilder)
    // to actually discover it over the network, which a JS-injected blob: URL
    // cannot be. This just adds the couple of Apple-specific meta tags that
    // aren't worth hardcoding into every single HTML file.
    if (App._pwaInjected) return;
    App._pwaInjected = true;
    try {
        var appleCapable = document.createElement('meta');
        appleCapable.name = 'apple-mobile-web-app-capable'; appleCapable.content = 'yes';
        document.head.appendChild(appleCapable);
        var appleStatus = document.createElement('meta');
        appleStatus.name = 'apple-mobile-web-app-status-bar-style'; appleStatus.content = 'black-translucent';
        document.head.appendChild(appleStatus);
    } catch (e) { console.error('PWA meta injection failed', e); }
};

App.renderAnnouncementBanner = function () {
    var slot = document.getElementById('announcement-banner-slot');
    if (!slot || !App._db) return;
    App._db.collection('siteConfig').doc('announcement').get().then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        if (!data.active || !data.text) return;
        if (sessionStorage.getItem('tfrej_announcement_dismissed') === data.text) return;

        var escaped = String(data.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        slot.innerHTML =
            '<div class="w-full bg-primary text-white text-xs md:text-sm font-bold px-4 py-2.5 flex items-center justify-center gap-4 relative md:rounded-t-2xl">' +
                '<span class="text-center">' + escaped + '</span>' +
                '<button id="announcement-dismiss-btn" class="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 flex-shrink-0" aria-label="Dismiss announcement">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
                '</button>' +
            '</div>';
        document.getElementById('announcement-dismiss-btn').addEventListener('click', function () {
            sessionStorage.setItem('tfrej_announcement_dismissed', data.text);
            slot.innerHTML = '';
        });
    }).catch(function (e) { console.error('announcement load failed', e); });
};

App.renderNav = function (activeHref) {
    App.injectPwaManifest();
    App.registerServiceWorker();
    var root = document.getElementById('nav-root');
    if (!root) return;
    root.innerHTML =
        '<nav class="safe-top fixed top-0 md:top-4 left-0 right-0 z-[100] flex flex-col items-center w-full">' +
            '<div id="announcement-banner-slot" class="w-full flex justify-center"></div>' +
            '<div id="navbar-inner" class="bg-white/80 dark:bg-black/60 backdrop-blur-md md:rounded-2xl border-b md:border border-black/5 dark:border-white/5 shadow-lg px-5 md:px-10 h-[64px] md:h-[76px] flex items-center justify-between gap-4 w-full max-w-[1800px] transition-shadow duration-300">' +
                '<a href="index.html" class="flex items-center gap-2 flex-shrink-0 focusable rounded"><span class="text-2xl md:text-3xl font-black tracking-tighter text-black dark:text-white leading-none">Tfrej<span class="text-primary">NOW</span></span></a>' +
                '<div class="hidden lg:flex items-center gap-6 text-sm font-bold text-zinc-600 dark:text-zinc-300">' +
                    navLink('index.html', 'Home', activeHref) +
                    navLink('trending.html', 'Trending', activeHref) +
                    navLink('movies.html', 'Movies', activeHref) +
                    navLink('tvshow.html', 'TV Shows', activeHref) +
                    navLink('anime.html', 'Anime', activeHref) +
                    navLink('live-tv.html', 'Live TV', activeHref) +
                    navLink('radio.html', 'Radio', activeHref) +
                    navLink('watchlist.html', 'My List', activeHref) +
                    navLink('continue-watching.html', 'Continue Watching', activeHref) +
                    '<span id="nav-admin-slot"></span>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                    '<div id="nav-auth-slot" class="hidden md:flex items-center gap-2"></div>' +
                    '<div class="relative">' +
                        '<button id="notif-bell-btn" aria-label="Notifications" class="relative p-2 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-zinc-700 dark:text-zinc-300">' +
                            '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
                            '<span id="notif-badge" class="hidden absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">0</span>' +
                        '</button>' +
                        '<div id="notif-panel" class="hidden absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white dark:bg-black/95 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"></div>' +
                    '</div>' +
                    '<button onclick="App.toggleTheme()" aria-label="Toggle theme" class="p-2 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-zinc-700 dark:text-zinc-300">' +
                        '<svg class="hidden dark:block w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>' +
                        '<svg class="block dark:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>' +
                    '</button>' +
                    '<button id="mobile-menu-btn" onclick="App.toggleMobileMenu()" aria-label="Open menu" aria-expanded="false" class="lg:hidden p-2 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-zinc-700 dark:text-zinc-300">' +
                        '<svg id="icon-menu-open" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>' +
                        '<svg id="icon-menu-close" class="hidden w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div id="mobile-menu" class="hidden lg:hidden w-full max-w-[1800px] mt-2 bg-white/95 dark:bg-black/90 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 shadow-xl overflow-hidden">' +
                mobileLink('index.html', 'Home', activeHref) +
                mobileLink('trending.html', 'Trending', activeHref) +
                mobileLink('movies.html', 'Movies', activeHref) +
                mobileLink('tvshow.html', 'TV Shows', activeHref) +
                mobileLink('anime.html', 'Anime', activeHref) +
                mobileLink('live-tv.html', 'Live TV', activeHref) +
                mobileLink('radio.html', 'Radio', activeHref) +
                mobileLink('watchlist.html', 'My List', activeHref) +
                mobileLink('continue-watching.html', 'Continue Watching', activeHref) +
                '<div id="mobile-admin-slot"></div>' +
                '<div id="mobile-auth-slot" class="border-t border-black/5 dark:border-white/5"></div>' +
            '</div>' +
        '</nav>';

    document.addEventListener('click', function (e) {
        var menu = document.getElementById('mobile-menu');
        var btn = document.getElementById('mobile-menu-btn');
        if (!menu || menu.classList.contains('hidden')) return;
        if (!menu.contains(e.target) && !btn.contains(e.target)) App.closeMobileMenu();
    });
    window.addEventListener('scroll', function () {
        var inner = document.getElementById('navbar-inner');
        if (!inner) return;
        inner.classList.toggle('scrolled', window.scrollY > 20);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') App.closeMobileMenu(); });

    App.renderAuthNav();
    App.renderAnnouncementBanner();
    App._wireNotificationBell();
    App.renderNotificationBell();

    function navLink(href, label, active) {
        var isActive = active === href;
        return '<a href="' + href + '" class="hover:text-primary transition-colors focusable rounded' + (isActive ? ' text-primary' : '') + '">' + label + '</a>';
    }
    function mobileLink(href, label, active) {
        var isActive = active === href;
        return '<a href="' + href + '" class="block px-6 py-3.5 text-sm font-bold hover:bg-primary hover:text-white transition-colors border-b border-black/5 dark:border-white/5 ' + (isActive ? 'text-primary' : 'text-zinc-700 dark:text-zinc-200') + '">' + label + '</a>';
    }
};

App.renderAuthNav = function () {
    var deskSlot = document.getElementById('nav-auth-slot');
    var mobSlot = document.getElementById('mobile-auth-slot');
    if (!deskSlot && !mobSlot) return;
    var user = App.Auth.currentUser;
    if (user) {
        var username = (App.userData && App.userData.username) ? App.userData.username : user.email;
        var activeProfile = App.getActiveProfile ? App.getActiveProfile() : null;
        var otherProfiles = activeProfile ? (App._rawProfiles || []).filter(function (p) { return p.id !== activeProfile.id; }) : [];
        var triggerLabel = activeProfile ? activeProfile.name : username;
        var triggerAvatar = activeProfile ? activeProfile.avatar : '👤';

        var switchItemsHtml = otherProfiles.map(function (p) {
            return '<button class="profile-switch-item w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-left" data-id="' + p.id + '">' +
                '<span class="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style="background-color:' + App.avatarColorFor(p.avatar) + '22; border:1.5px solid ' + App.avatarColorFor(p.avatar) + '">' + p.avatar + '</span>' +
                '<span class="text-sm font-bold text-black dark:text-white truncate">' + p.name + '</span>' +
                (p.pin ? '<span class="ml-auto text-xs flex-shrink-0">🔒</span>' : '') +
            '</button>';
        }).join('');

        var panelInner =
            (otherProfiles.length ? '<p class="px-3 pt-1 pb-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Switch Profile</p>' + switchItemsHtml + '<div class="border-t border-black/10 dark:border-white/10 my-1.5"></div>' : '') +
            '<a href="profiles.html" class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-lg">🔀 Manage Profiles</a>' +
            '<a href="profile.html" class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-lg">⚙️ Account Settings</a>' +
            '<a href="changelog.html" class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-lg">📋 Updates</a>' +
            '<a href="help.html" class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-lg">❓ Help & Guide</a>' +
            '<div class="border-t border-black/10 dark:border-white/10 my-1.5"></div>' +
            '<button onclick="App.signOutUser()" class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-500/10 rounded-lg text-left">🚪 Sign Out</button>';

        if (deskSlot) {
            deskSlot.innerHTML =
                '<div class="relative">' +
                    '<button id="account-dropdown-btn" class="flex items-center gap-2 text-xs font-bold text-white bg-primary hover:bg-primary/80 pl-1.5 pr-2.5 py-1 rounded-full transition-colors">' +
                        '<span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">' + triggerAvatar + '</span>' +
                        '<span class="max-w-[100px] truncate">' + triggerLabel + '</span>' +
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>' +
                    '</button>' +
                    '<div id="account-dropdown-panel" class="hidden absolute right-0 top-full mt-2 w-60 bg-white dark:bg-black/95 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-2 z-50">' +
                        panelInner +
                    '</div>' +
                '</div>';
        }
        if (mobSlot) {
            mobSlot.innerHTML =
                '<div class="px-6 py-3 flex items-center gap-2 text-xs font-bold text-white bg-primary/90"><span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">' + triggerAvatar + '</span>' + triggerLabel + '</div>' +
                otherProfiles.map(function (p) {
                    return '<button class="profile-switch-item w-full text-left px-6 py-3 flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10" data-id="' + p.id + '"><span class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm">' + p.avatar + '</span>' + p.name + (p.pin ? ' 🔒' : '') + '</button>';
                }).join('') +
                '<a href="profiles.html" class="block px-6 py-3 text-xs font-bold text-primary hover:bg-black/5 dark:hover:bg-white/10">🔀 Manage Profiles</a>' +
                '<a href="profile.html" class="block px-6 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10">⚙️ Account Settings</a>' +
                '<a href="changelog.html" class="block px-6 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10">📋 Updates</a>' +
                '<a href="help.html" class="block px-6 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10">❓ Help & Guide</a>' +
                '<button onclick="App.signOutUser()" class="w-full text-left px-6 py-3.5 text-sm font-bold text-red-500 hover:bg-red-500/10 border-t border-black/5 dark:border-white/5">🚪 Sign Out</button>';
        }

        App._wireProfileDropdown();
    } else {
        if (deskSlot) deskSlot.innerHTML = '<a href="login.html" class="text-xs font-bold px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10">Sign In</a><a href="signup.html" class="text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-white hover:bg-primary/80">Sign Up</a>';
        if (mobSlot) mobSlot.innerHTML = '<a href="login.html" class="block px-6 py-3.5 text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-primary hover:text-white">Sign In</a><a href="signup.html" class="block px-6 py-3.5 text-sm font-bold text-primary hover:bg-primary hover:text-white">Sign Up</a>';
    }
};

App._wireProfileDropdown = function () {
    var btn = document.getElementById('account-dropdown-btn');
    var panel = document.getElementById('account-dropdown-panel');
    if (btn && panel) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.classList.toggle('hidden');
        });
        document.addEventListener('click', function (e) {
            if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });
    }
    document.querySelectorAll('.profile-switch-item').forEach(function (item) {
        item.addEventListener('click', function () {
            var id = item.getAttribute('data-id');
            var profile = (App._rawProfiles || []).filter(function (p) { return p.id === id; })[0];
            if (!profile) return;
            if (profile.pin) { location.href = 'profiles.html'; return; }
            App.selectProfile(id);
            location.reload();
        });
    });
};

App.toggleMobileMenu = function () {
    var menu = document.getElementById('mobile-menu');
    var isOpen = !menu.classList.contains('hidden');
    if (isOpen) { App.closeMobileMenu(); return; }
    menu.classList.remove('hidden');
    document.getElementById('icon-menu-open').classList.add('hidden');
    document.getElementById('icon-menu-close').classList.remove('hidden');
    document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'true');
};
App.closeMobileMenu = function () {
    var menu = document.getElementById('mobile-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    document.getElementById('icon-menu-open').classList.remove('hidden');
    document.getElementById('icon-menu-close').classList.add('hidden');
    document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'false');
};

App.renderFooter = function () {
    var root = document.getElementById('footer-root');
    if (!root) return;
    root.innerHTML =
        '<footer class="w-full border-t border-black/10 dark:border-white/5 mt-auto bg-lightbg/80 dark:bg-black/50 backdrop-blur-md">' +
            '<div class="max-w-[1800px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16 py-10 text-center flex flex-col items-center gap-4">' +
                '<span class="text-2xl font-black tracking-tighter text-black dark:text-white opacity-50">Tfrej<span class="text-primary">NOW</span></span>' +
                '<p class="text-xs text-zinc-500 max-w-2xl leading-relaxed">Disclaimer: TfrejNOW is a UI wrapper and does not host, upload, or store any videos. All video streams are provided by non-affiliated third-party services.</p>' +
            '</div>' +
        '</footer>';
};

/* ============================================================
   GENRE PILL BAR (used on index.html)
   ============================================================ */
App.renderGenreBar = function (containerId) {
    var row = document.getElementById(containerId);
    if (!row) return;
    row.innerHTML = '';
    App.GENRES.forEach(function (g) {
        var btn = document.createElement('a');
        btn.href = 'genre.html?m=' + (g.m || '') + '&t=' + (g.t || '') + '&name=' + encodeURIComponent(g.label);
        btn.className = 'px-4 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-primary hover:text-white border border-black/10 dark:border-white/10 text-xs font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors flex-shrink-0';
        btn.textContent = g.label;
        row.appendChild(btn);
    });
};
/* Reusable "row with left/right scroll arrows" wrapper markup, used for cast,
   similar titles, recommended, and any other horizontally-scrolling row. */
App._scrollRowShell = function (rowId) {
    return '<div class="relative group/row">' +
        '<button type="button" onclick="App.scrollRow(\'' + rowId + '\',-1)" aria-label="Scroll left" class="hidden md:flex opacity-0 group-hover/row:opacity-100 transition-opacity absolute -left-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-black/90 border border-black/10 dark:border-white/10 shadow-lg text-zinc-700 dark:text-zinc-200 hover:bg-primary hover:text-white">‹</button>' +
        '<div id="' + rowId + '" class="flex gap-4 overflow-x-auto no-scrollbar pb-4 scroll-smooth"></div>' +
        '<button type="button" onclick="App.scrollRow(\'' + rowId + '\',1)" aria-label="Scroll right" class="hidden md:flex opacity-0 group-hover/row:opacity-100 transition-opacity absolute -right-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-black/90 border border-black/10 dark:border-white/10 shadow-lg text-zinc-700 dark:text-zinc-200 hover:bg-primary hover:text-white">›</button>' +
    '</div>';
};
App._ensureRowShell = function (shellId, rowId) {
    var shell = document.getElementById(shellId);
    if (!shell || document.getElementById(rowId)) return; // already injected
    shell.innerHTML = App._scrollRowShell(rowId);
};
App.scrollRow = function (id, dir) {
    var row = document.getElementById(id);
    if (row) row.scrollBy({ left: dir * 220, behavior: 'smooth' });
};
App.wireRowDrag = function (id) {
    var row = document.getElementById(id);
    if (!row) return;
    row.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    var isDown = false, startX = 0, startScroll = 0;
    row.addEventListener('mousedown', function (e) { isDown = true; startX = e.pageX; startScroll = row.scrollLeft; });
    window.addEventListener('mouseup', function () { isDown = false; });
    row.addEventListener('mousemove', function (e) { if (isDown) row.scrollLeft = startScroll - (e.pageX - startX); });
};

/* ============================================================
   SKELETONS
   ============================================================ */
App.skeletons = function (count, horizontal) {
    var html = '';
    for (var i = 0; i < count; i++) {
        html += '<div class="' + (horizontal ? 'w-32 md:w-44 flex-shrink-0' : 'w-full') + ' skeleton border border-black/10 dark:border-white/10 rounded-xl aspect-[2/3]"></div>';
    }
    return html;
};

/* ============================================================
   CARD RENDERING (links are real <a> hrefs to title.html -> real back button support)
   ============================================================ */
App.renderTopTenRow = function (results, containerId, defaultMediaType) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = results.slice(0, 10).map(function (item, i) {
        var mediaType = item.media_type || defaultMediaType;
        var title = item.title || item.name || 'Untitled';
        var posterPath = item.poster_path ? (App.IMG_BASE_URL + item.poster_path) : App.NO_POSTER;
        var href = 'title.html?type=' + mediaType + '&id=' + item.id;
        return '<a href="' + href + '" class="focusable flex-shrink-0 flex items-end -space-x-3 sm:-space-x-4 fade-in-scale" style="animation-delay:' + Math.min(i * 60, 400) + 'ms; opacity:0;">' +
            '<span class="text-[64px] sm:text-[84px] md:text-[104px] font-black leading-[0.8] select-none flex-shrink-0" ' +
                'style="-webkit-text-stroke: 2px #6d28d9; -webkit-text-fill-color: transparent; color: #6d28d9;">' + (i + 1) + '</span>' +
            '<div class="poster-card relative w-24 sm:w-32 md:w-36 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-lg z-10">' +
                '<img src="' + posterPath + '" onerror="this.onerror=null;this.src=\'' + App.NO_POSTER + '\';" class="w-full h-full object-cover" loading="lazy">' +
            '</div>' +
        '</a>';
    }).join('');
    container.innerHTML = html;
};

App.renderCards = function (results, containerId, defaultMediaType, horizontal, append, removeType) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!append) container.innerHTML = '';

    var html = '';
    results.forEach(function (item, cardIndex) {
        var mediaType = item.media_type || defaultMediaType;
        if (mediaType !== 'movie' && mediaType !== 'tv') return;

        var title = item.title || item.name || 'Untitled';
        var posterPath = item.poster_path ? (App.IMG_BASE_URL + item.poster_path) : App.NO_POSTER;
        var year = (item.release_date || item.first_air_date || '').substring(0, 4);
        var rating = item.vote_average ? item.vote_average.toFixed(1) : null;
        var href = (removeType === 'continue')
            ? 'title.html?type=' + mediaType + '&id=' + item.id + '&resume=1'
            : 'title.html?type=' + mediaType + '&id=' + item.id;

        var progressTag = '';
        var progressBarHtml = '';
        if (mediaType === 'tv' && App.userData.progress[item.id]) {
            var prog = App.userData.progress[item.id];
            if (prog.season > 1 || prog.episode > 1) {
                progressTag = '<div class="absolute top-2 left-2 z-10 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">S' + prog.season + ':E' + prog.episode + '</div>';
            }
        }
        if (removeType === 'continue' && App.userData.progress[item.id] && App.userData.progress[item.id].progressPercent) {
            var pct = Math.max(2, Math.min(100, App.userData.progress[item.id].progressPercent));
            progressBarHtml = '<div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10"><div class="h-full bg-primary" style="width:' + pct + '%"></div></div>';
        }

        var overview = (item.overview || '').trim();
        var hoverOverviewHtml = overview
            ? '<div class="hidden md:flex absolute inset-0 bg-black/85 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 items-center pointer-events-none">' +
                '<p class="text-white text-[11px] leading-relaxed line-clamp-[8]">' + overview.replace(/</g, '&lt;') + '</p>' +
              '</div>'
            : '';

        var removeBtn = '';
        if (removeType) {
            removeBtn = '<button class="remove-card-btn absolute top-2 right-2 z-20 bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors" data-remove-type="' + removeType + '" data-remove-id="' + item.id + '" aria-label="Remove">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
        }

        html += '' +
            '<a href="' + href + '" class="poster-card fade-in-scale ' + (horizontal ? 'w-40 sm:w-48 md:w-56 lg:w-60 flex-shrink-0' : '') + ' focusable block bg-black/5 dark:bg-black/40 rounded-xl overflow-hidden border border-black/10 dark:border-white/5 hover:border-primary/60 cursor-pointer group shadow-md relative" style="animation-delay:' + Math.min(cardIndex * 40, 400) + 'ms; opacity:0;">' +
                progressTag + removeBtn +
                '<div class="relative aspect-[2/3] overflow-hidden bg-zinc-200 dark:bg-zinc-900">' +
                    '<img src="' + posterPath + '" onerror="this.onerror=null;this.src=\'' + App.NO_POSTER + '\';" class="w-full h-full object-cover group-hover:scale-110" loading="lazy">' +
                    '<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/25">' +
                        '<div class="bg-primary text-white rounded-full p-3.5 shadow-lg shadow-primary/50"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>' +
                    '</div>' +
                    hoverOverviewHtml +
                    '<div class="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 text-white text-[11px] font-bold">' +
                        (rating ? '<span class="flex items-center gap-0.5 text-yellow-400">★ ' + rating + '</span>' : '') +
                        (year ? '<span>' + year + '</span>' : '') +
                    '</div>' +
                    progressBarHtml +
                '</div>' +
                '<div class="p-3"><h3 class="text-black dark:text-white text-sm md:text-base font-bold truncate">' + title + '</h3><p class="text-[10px] font-bold text-zinc-500 uppercase mt-1 tracking-wider">' + mediaType + '</p></div>' +
            '</a>';
    });
    container.insertAdjacentHTML('beforeend', html);

    if (removeType) {
        container.querySelectorAll('.remove-card-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                var id = btn.getAttribute('data-remove-id');
                var type = btn.getAttribute('data-remove-type');
                if (type === 'watchlist') App.removeFromWatchlist(id);
                else if (type === 'continue') App.removeFromContinue(id);
            });
        });
    }
};

App.retryHtml = function (containerId, fnName) {
    return '<div class="col-span-full text-center text-zinc-500 py-6 text-sm">Failed to load. <button onclick="' + fnName + '()" class="text-primary font-bold hover:underline">Retry</button></div>';
};

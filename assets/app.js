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
    server1: { name: 'Server 1 (Auto-Next)', movie: function(id){ return 'https://vidapi.qzz.io/movie/'+id+qzzParams; }, tv: function(id){ return 'https://vidapi.qzz.io/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode+qzzParams; } },
    server2: { name: 'Server 2', movie: function(id){ return 'https://vaplayer.ru/embed/movie/?tmdb='+id; }, tv: function(id){ return 'https://vaplayer.ru/embed/tv/?tmdb='+id+'&season='+App.currentSeason+'&episode='+App.currentEpisode; } },
    server3: { name: 'Server 3', movie: function(id){ return 'https://vidapi.xyz/embed/movie/'+id; }, tv: function(id){ return 'https://vidapi.xyz/embed/tv/'+id+'/'+App.currentSeason+'/'+App.currentEpisode; } }
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

        // Profile picker gate - runs only once sign-in/approval/ban checks all pass.
        if (!App.activeProfileId && location.pathname.indexOf('profiles.html') === -1) {
            console.warn('No active profile found - redirecting to profiles.html. Debug info:', {
                sessionStorageValue: App.Auth.currentUser ? sessionStorage.getItem('tfrej_profile_' + App.Auth.currentUser.uid) : null,
                knownProfileIds: (App._rawProfiles || []).map(function (p) { return p.id; })
            });
            location.href = 'profiles.html';
        }
    });
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
   list/search endpoints, so this leans on genre tags. Requires a kid-safe
   genre AND excludes anything also tagged with a mature-adjacent genre,
   since plenty of mature content (adult animation, violent anime, etc.)
   still carries the Animation tag on its own. */
App.KIDS_SAFE_GENRES = [10751, 16]; // Family, Animation
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

App.getActiveProfile = function () {
    return App._rawProfiles.filter(function (p) { return p.id === App.activeProfileId; })[0] || null;
};
App.isKidsProfile = function () {
    var p = App.getActiveProfile();
    return !!(p && p.isKids);
};
App.addProfile = function (name, avatar, isKids, pin) {
    if (App._rawProfiles.length >= App.MAX_PROFILES) return Promise.reject({ message: 'Maximum ' + App.MAX_PROFILES + ' profiles allowed.' });
    var id = 'p' + Date.now();
    App._rawProfiles.push({ id: id, name: name, avatar: avatar, isKids: !!isKids, pin: pin || null, createdAt: Date.now() });
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
App.saveProgress = function (item, mediaType, season, episode) {
    if (!App.requireAuth()) return;
    App.userData.progress[item.id] = { id: item.id, title: item.name || item.title, poster_path: item.poster_path, media_type: mediaType, season: season || null, episode: episode || null, ts: Date.now() };
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
App.renderNav = function (activeHref) {
    var root = document.getElementById('nav-root');
    if (!root) return;
    root.innerHTML =
        '<nav class="safe-top fixed top-0 md:top-4 left-0 right-0 z-[100] flex flex-col items-center w-full">' +
            '<div id="navbar-inner" class="bg-white/80 dark:bg-black/60 backdrop-blur-md md:rounded-2xl border-b md:border border-black/5 dark:border-white/5 shadow-lg px-5 md:px-10 h-[64px] md:h-[76px] flex items-center justify-between gap-4 w-full max-w-[1800px] transition-shadow duration-300">' +
                '<a href="index.html" class="flex items-center gap-2 flex-shrink-0 focusable rounded"><span class="text-2xl md:text-3xl font-black tracking-tighter text-black dark:text-white leading-none">Tfrej<span class="text-primary">NOW</span></span></a>' +
                '<div class="hidden lg:flex items-center gap-6 text-sm font-bold text-zinc-600 dark:text-zinc-300">' +
                    navLink('index.html', 'Home', activeHref) +
                    navLink('trending.html', 'Trending', activeHref) +
                    navLink('movies.html', 'Movies', activeHref) +
                    navLink('tvshow.html', 'TV Shows', activeHref) +
                    navLink('anime.html', 'Anime', activeHref) +
                    navLink('watchlist.html', 'My List', activeHref) +
                    navLink('continue-watching.html', 'Continue Watching', activeHref) +
                    '<span id="nav-admin-slot"></span>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                    '<div id="nav-auth-slot" class="hidden md:flex items-center gap-2"></div>' +
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
        var displayName = (App.userData && App.userData.username) ? App.userData.username : user.email;
        var activeProfile = App.getActiveProfile ? App.getActiveProfile() : null;
        var profileChip = activeProfile
            ? '<button onclick="App.switchProfile()" class="flex items-center gap-2 text-xs font-bold text-white bg-primary hover:bg-primary/80 pl-1.5 pr-3 py-1 rounded-full transition-colors" title="Switch Profile">' +
                '<span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">' + activeProfile.avatar + '</span>' + activeProfile.name +
              '</button>'
            : '';
        if (deskSlot) deskSlot.innerHTML = profileChip + '<a href="profile.html" class="text-xs font-medium text-zinc-400 dark:text-zinc-500 max-w-[110px] truncate hover:text-primary transition-colors" title="Account settings">' + displayName + '</a><button onclick="App.signOutUser()" class="text-xs font-bold px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10">Sign Out</button>';
        if (mobSlot) mobSlot.innerHTML = (activeProfile ? '<button onclick="App.switchProfile()" class="w-full text-left px-6 py-3.5 flex items-center gap-2 text-xs font-bold text-white bg-primary/90 hover:bg-primary transition-colors"><span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">' + activeProfile.avatar + '</span>' + activeProfile.name + ' · Switch Profile</button>' : '') + '<a href="profile.html" class="block px-6 py-3.5 text-xs font-medium text-zinc-500 truncate hover:text-primary transition-colors">Account: ' + displayName + '</a><button onclick="App.signOutUser()" class="w-full text-left px-6 py-3.5 text-sm font-bold text-red-500 hover:bg-red-500/10">Sign Out</button>';
    } else {
        if (deskSlot) deskSlot.innerHTML = '<a href="login.html" class="text-xs font-bold px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10">Sign In</a><a href="signup.html" class="text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-white hover:bg-primary/80">Sign Up</a>';
        if (mobSlot) mobSlot.innerHTML = '<a href="login.html" class="block px-6 py-3.5 text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-primary hover:text-white">Sign In</a><a href="signup.html" class="block px-6 py-3.5 text-sm font-bold text-primary hover:bg-primary hover:text-white">Sign Up</a>';
    }
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
App.renderCards = function (results, containerId, defaultMediaType, horizontal, append, removeType) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!append) container.innerHTML = '';

    var html = '';
    results.forEach(function (item) {
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
        if (mediaType === 'tv' && App.userData.progress[item.id]) {
            var prog = App.userData.progress[item.id];
            if (prog.season > 1 || prog.episode > 1) {
                progressTag = '<div class="absolute top-2 left-2 z-10 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">S' + prog.season + ':E' + prog.episode + '</div>';
            }
        }

        var removeBtn = '';
        if (removeType) {
            removeBtn = '<button class="remove-card-btn absolute top-2 right-2 z-20 bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors" data-remove-type="' + removeType + '" data-remove-id="' + item.id + '" aria-label="Remove">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
        }

        html += '' +
            '<a href="' + href + '" class="poster-card ' + (horizontal ? 'w-40 sm:w-48 md:w-56 lg:w-60 flex-shrink-0' : '') + ' focusable block bg-black/5 dark:bg-black/40 rounded-xl overflow-hidden border border-black/10 dark:border-white/5 hover:border-primary/60 cursor-pointer group shadow-md relative">' +
                progressTag + removeBtn +
                '<div class="relative aspect-[2/3] overflow-hidden bg-zinc-200 dark:bg-zinc-900">' +
                    '<img src="' + posterPath + '" class="w-full h-full object-cover group-hover:scale-110" loading="lazy">' +
                    '<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/25">' +
                        '<div class="bg-primary text-white rounded-full p-3.5 shadow-lg shadow-primary/50"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>' +
                    '</div>' +
                    '<div class="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 text-white text-[11px] font-bold">' +
                        (rating ? '<span class="flex items-center gap-0.5 text-yellow-400">★ ' + rating + '</span>' : '') +
                        (year ? '<span>' + year + '</span>' : '') +
                    '</div>' +
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

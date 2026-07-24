'use strict';

/* Note on scale: this reads Firestore directly from the browser (no backend),
   capped at a few hundred/thousand recent docs per query. Fine for a small-to-
   medium site. If this ever needs to handle a large user base, the aggregate
   stats here should move to a scheduled Cloud Function that pre-computes them
   instead of scanning collections client-side on every dashboard load. */

function fmtDate(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysAgo(ts) {
    if (!ts) return Infinity;
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return (Date.now() - d.getTime()) / 86400000;
}
function dayKey(ts) {
    if (!ts) return null;
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().substring(0, 10);
}

/* ============================================================
   ADMIN DASHBOARD (overview + analytics)
   ============================================================ */
App.initAdminDashboard = function () {
    App.renderNav('admin.html');
    App.renderFooter();
    App.gateAdminAccess(function () {
        App._loadAdminOverview();
        App._wireAnnouncementForm();
    });
};

App._wireAnnouncementForm = function () {
    var textInput = document.getElementById('announcement-text-input');
    var activeToggle = document.getElementById('announcement-active-toggle');
    var saveBtn = document.getElementById('announcement-save-btn');
    var clearBtn = document.getElementById('announcement-clear-btn');
    if (!textInput || !saveBtn) return;

    App.loadAnnouncementForAdmin().then(function (data) {
        textInput.value = data.text || '';
        activeToggle.checked = !!data.active;
    });

    saveBtn.addEventListener('click', function () {
        var text = textInput.value.trim();
        var active = activeToggle.checked;
        if (active && !text) { App.showToast('Enter a message first, or leave "Show on site" unchecked.'); return; }
        saveBtn.disabled = true; saveBtn.innerText = 'Saving...';
        App.saveAnnouncement(text, active).then(function () {
            App.showToast(active ? 'Announcement is now live' : 'Announcement saved (hidden)');
        }).catch(function (e) {
            console.error(e); App.showToast('Failed to save announcement.');
        }).finally(function () {
            saveBtn.disabled = false; saveBtn.innerText = 'Save';
        });
    });

    clearBtn.addEventListener('click', function () {
        textInput.value = '';
        activeToggle.checked = false;
        App.saveAnnouncement('', false).then(function () {
            App.showToast('Announcement cleared');
        }).catch(function (e) { console.error(e); App.showToast('Failed to clear announcement.'); });
    });
};

App.saveAnnouncement = function (text, active) {
    return App._db.collection('siteConfig').doc('announcement').set({
        text: text, active: active, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};
App.loadAnnouncementForAdmin = function () {
    return App._db.collection('siteConfig').doc('announcement').get()
        .then(function (doc) { return doc.exists ? doc.data() : { text: '', active: false }; });
};

App._loadAdminOverview = function () {
    var usersP = App._db.collection('users').orderBy('createdAt', 'desc').limit(500).get().catch(function () { return { docs: [] }; });
    var logsP = App._db.collection('watchLogs').orderBy('ts', 'desc').limit(500).get().catch(function () { return { docs: [] }; });
    var searchesP = App._db.collection('searchLogs').orderBy('ts', 'desc').limit(500).get().catch(function () { return { docs: [] }; });

    Promise.all([usersP, logsP, searchesP]).then(function (results) {
        var users = results[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        var logs = results[1].docs.map(function (d) { return d.data(); });
        var searches = results[2].docs.map(function (d) { return d.data(); });

        App._renderOverviewCards(users, logs);
        App._renderSignupsChart(users);
        App._renderMostWatched(logs);
        App._renderTopSearches(searches);
        App._renderRecentActivity(logs);
    });
};

App._renderOverviewCards = function (users, logs) {
    var totalUsers = users.length;
    var newUsers7d = users.filter(function (u) { return daysAgo(u.createdAt) <= 7; }).length;
    var activeUsers7d = users.filter(function (u) { return daysAgo(u.lastActiveAt) <= 7; }).length;
    var blockedUsers = users.filter(function (u) { return App.isCurrentlyBanned(u); }).length;
    var totalEvents = logs.length;

    var counts = {};
    logs.forEach(function (l) { counts[l.title] = (counts[l.title] || 0) + 1; });
    var topTitle = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || '—';

    var cards = [
        { label: 'Total Users', value: totalUsers + (totalUsers >= 500 ? '+' : '') },
        { label: 'New Users (7d)', value: newUsers7d },
        { label: 'Active Users (7d)', value: activeUsers7d },
        { label: 'Watch Events', value: totalEvents + (totalEvents >= 500 ? '+' : '') },
        { label: 'Blocked Users', value: blockedUsers },
        { label: 'Most Watched', value: topTitle, small: true }
    ];
    document.getElementById('overview-cards').innerHTML = cards.map(function (c) {
        return '<div class="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5">' +
            '<p class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">' + c.label + '</p>' +
            '<p class="' + (c.small ? 'text-lg' : 'text-3xl') + ' font-black text-black dark:text-white truncate">' + c.value + '</p>' +
        '</div>';
    }).join('');
};

App._renderSignupsChart = function (users) {
    var days = [];
    for (var i = 13; i >= 0; i--) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().substring(0, 10));
    }
    var counts = {};
    days.forEach(function (d) { counts[d] = 0; });
    users.forEach(function (u) {
        var k = dayKey(u.createdAt);
        if (k && counts.hasOwnProperty(k)) counts[k]++;
    });

    var ctx = document.getElementById('signups-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(function (d) { return d.substring(5); }),
            datasets: [{ label: 'New signups', data: days.map(function (d) { return counts[d]; }), backgroundColor: '#6d28d9', borderRadius: 4 }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
};

App._renderMostWatched = function (logs) {
    var counts = {};
    logs.forEach(function (l) {
        if (!counts[l.itemId]) counts[l.itemId] = { title: l.title, mediaType: l.mediaType, itemId: l.itemId, count: 0 };
        counts[l.itemId].count++;
    });
    var top = Object.keys(counts).map(function (k) { return counts[k]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
    var el = document.getElementById('most-watched-list');
    if (!top.length) { el.innerHTML = '<p class="text-zinc-500 text-sm py-4">No watch activity yet.</p>'; return; }
    el.innerHTML = top.map(function (t, i) {
        return '<a href="title.html?type=' + t.mediaType + '&id=' + t.itemId + '" class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">' +
            '<span class="flex items-center gap-3 min-w-0"><span class="text-xs font-black text-primary w-5 flex-shrink-0">#' + (i + 1) + '</span><span class="text-sm font-bold text-black dark:text-white truncate">' + t.title + '</span></span>' +
            '<span class="text-xs font-bold text-zinc-500 flex-shrink-0">' + t.count + ' views</span>' +
        '</a>';
    }).join('');
};

App._renderTopSearches = function (searches) {
    var counts = {};
    searches.forEach(function (s) {
        var key = (s.query || '').toLowerCase();
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
    });
    var top = Object.keys(counts).map(function (k) { return { query: k, count: counts[k] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
    var el = document.getElementById('top-searches-list');
    if (!top.length) { el.innerHTML = '<p class="text-zinc-500 text-sm py-4">No searches logged yet.</p>'; return; }
    el.innerHTML = top.map(function (s, i) {
        return '<a href="search.html?q=' + encodeURIComponent(s.query) + '" class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">' +
            '<span class="flex items-center gap-3 min-w-0"><span class="text-xs font-black text-primary w-5 flex-shrink-0">#' + (i + 1) + '</span><span class="text-sm font-bold text-black dark:text-white truncate">' + s.query + '</span></span>' +
            '<span class="text-xs font-bold text-zinc-500 flex-shrink-0">' + s.count + '×</span>' +
        '</a>';
    }).join('');
};

App._renderRecentActivity = function (logs) {
    var el = document.getElementById('recent-activity-list');
    var recent = logs.slice(0, 50);
    if (!recent.length) { el.innerHTML = '<p class="text-zinc-500 text-sm py-4">No activity yet.</p>'; return; }
    el.innerHTML = recent.map(function (l) {
        var epText = l.mediaType === 'tv' && l.season ? ' · S' + l.season + ':E' + l.episode : '';
        return '<div class="flex items-center justify-between py-2.5 px-3 border-b border-black/5 dark:border-white/5 last:border-0">' +
            '<div class="min-w-0"><p class="text-sm font-bold text-black dark:text-white truncate">' + (l.email || 'Unknown') + '</p>' +
            '<p class="text-xs text-zinc-500 truncate">' + l.title + epText + '</p></div>' +
            '<span class="text-xs text-zinc-500 flex-shrink-0 ml-3">' + fmtDateTime(l.ts) + '</span>' +
        '</div>';
    }).join('');
};

/* ============================================================
   ADMIN USERS PAGE (table, search, block/unblock, drill-down)
   ============================================================ */
App._allUsers = [];

App.initAdminUsersPage = function () {
    App.renderNav(null);
    App.renderFooter();
    App.gateAdminAccess(function () {
        App._loadAdminUsers();
        var input = document.getElementById('user-search-input');
        if (input) input.addEventListener('input', function (e) { App._renderUsersTable(e.target.value.trim().toLowerCase()); });
    });
};

App._loadAdminUsers = function () {
    App._db.collection('users').orderBy('createdAt', 'desc').limit(500).get().then(function (snap) {
        App._allUsers = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        App._renderUsersTable('');
    }).catch(function (e) {
        console.error(e);
        document.getElementById('users-table-body').innerHTML = '<tr><td colspan="6" class="text-center py-10 text-zinc-500">Failed to load users.</td></tr>';
    });
};

App._renderUsersTable = function (filter) {
    var list = App._allUsers;
    if (filter) list = list.filter(function (u) { return (u.email || '').toLowerCase().indexOf(filter) > -1 || (u.username || '').toLowerCase().indexOf(filter) > -1; });

    var body = document.getElementById('users-table-body');
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-zinc-500">No users found.</td></tr>'; return; }

    body.innerHTML = list.map(function (u) {
        var wlCount = (u.watchlist || []).length;
        var progCount = Object.keys(u.progress || {}).length;
        var banned = App.isCurrentlyBanned(u);
        var pending = u.approved === false;
        var statusHtml;
        if (pending) statusHtml = '<span class="text-yellow-500 font-bold text-xs">Pending Approval</span>';
        else if (banned && !u.blockedUntil) statusHtml = '<span class="text-red-500 font-bold text-xs">Banned (forever)</span>';
        else if (banned) statusHtml = '<span class="text-orange-500 font-bold text-xs">Banned until ' + fmtDateTime(u.blockedUntil) + '</span>';
        else statusHtml = '<span class="text-green-500 font-bold text-xs">Active</span>';

        return '' +
            '<tr class="border-b border-black/5 dark:border-white/5">' +
                '<td class="py-3 px-3 font-bold text-black dark:text-white">' + (u.username ? u.username + ' <span class="text-zinc-500 font-normal">(' + u.email + ')</span>' : (u.email || '—')) + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + fmtDate(u.createdAt) + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + fmtDateTime(u.lastActiveAt) + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + wlCount + ' saved · ' + progCount + ' in progress</td>' +
                '<td class="py-3 px-3">' + statusHtml + '</td>' +
                '<td class="py-3 px-3 text-right whitespace-nowrap">' +
                    '<button onclick="App._viewUserDetail(\'' + u.id + '\')" class="text-xs font-bold text-primary hover:underline">Manage</button>' +
                '</td>' +
            '</tr>';
    }).join('');
};

/* ============================================================
   ADMIN ACTIONS ON A USER
   ============================================================ */
App.adminApproveUser = function (uid, email) {
    return App._db.collection('users').doc(uid).set({ approved: true, approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .then(function () { return App.sendUserApprovedEmail(email); });
};
App.adminBanUser = function (uid, durationDaysOrDate, reason) {
    var data = { blocked: true, banReason: reason || null };
    if (durationDaysOrDate === 'forever') {
        data.blockedUntil = null;
    } else if (durationDaysOrDate instanceof Date) {
        data.blockedUntil = firebase.firestore.Timestamp.fromDate(durationDaysOrDate);
    } else {
        var until = new Date(Date.now() + Number(durationDaysOrDate) * 86400000);
        data.blockedUntil = firebase.firestore.Timestamp.fromDate(until);
    }
    return App._db.collection('users').doc(uid).set(data, { merge: true });
};
App.adminUnbanUser = function (uid) {
    return App._db.collection('users').doc(uid).set({ blocked: false, blockedUntil: null, banReason: null }, { merge: true });
};
App.adminUpdateUsernameFor = function (uid, username) {
    return App._db.collection('users').doc(uid).set({ username: username }, { merge: true });
};
App.adminSendPasswordReset = function (email) {
    return firebase.auth().sendPasswordResetEmail(email);
};
/* Clears every piece of watch data across all of their profiles - watchlist,
   progress, recently-viewed, restricted titles, and the profiles themselves.
   The account stays active - they can sign in and start completely fresh. */
App.adminWipeUserData = function (uid) {
    return App._db.collection('users').doc(uid).set({
        watchlist: [], progress: {}, recent: [], restrictedTitles: [],
        profiles: [], profileData: {},
        wipedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
};
/* "Delete" without a backend can't remove the Firebase Auth login itself -
   that requires the Admin SDK, which can only run on a server. This is the
   closest real equivalent: the account document is deleted entirely (so it's
   gone from the admin list, matching "removed"), and a tiny tombstone record
   permanently blocks that UID from ever accessing the site again - without
   the tombstone, they could sign back in with their still-existing password
   and get a brand-new approved account automatically, which would be worse. */
App.adminDeleteAccountEntirely = function (uid, email) {
    return App._db.collection('deletedAccounts').doc(uid).set({
        email: email || null,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
        return App._db.collection('users').doc(uid).delete();
    });
};
App.adminAddRestriction = function (uid, item) {
    var ref = App._db.collection('users').doc(uid);
    return ref.get().then(function (doc) {
        var list = (doc.data() && doc.data().restrictedTitles) || [];
        if (!list.some(function (r) { return String(r.id) === String(item.id); })) {
            list.push({ id: item.id, mediaType: item.media_type, title: item.title || item.name });
        }
        return ref.set({ restrictedTitles: list }, { merge: true }).then(function () { return list; });
    });
};
App.adminRemoveRestriction = function (uid, itemId) {
    var ref = App._db.collection('users').doc(uid);
    return ref.get().then(function (doc) {
        var list = ((doc.data() && doc.data().restrictedTitles) || []).filter(function (r) { return String(r.id) !== String(itemId); });
        return ref.set({ restrictedTitles: list }, { merge: true }).then(function () { return list; });
    });
};
/* Creates a real Firebase Auth account for someone else without logging the
   admin out - client SDKs can only sign in as "the current user," so this
   uses a throwaway secondary app instance to isolate that session, then
   discards it once the account + profile doc are created. */
App.adminCreateUser = function (email, password, username) {
    var secondary = firebase.apps.filter(function (a) { return a.name === 'AdminCreate'; })[0]
        || firebase.initializeApp(window.FIREBASE_CONFIG, 'AdminCreate');
    var secondaryAuth = secondary.auth();
    return secondaryAuth.createUserWithEmailAndPassword(email, password).then(function (cred) {
        var uid = cred.user.uid;
        return App._db.collection('users').doc(uid).set({
            email: email, username: username || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
            watchlist: [], progress: {}, recent: [], blocked: false, blockedUntil: null, restrictedTitles: []
        }).then(function () { return secondaryAuth.signOut(); });
    }).finally(function () {
        secondary.delete().catch(function () {});
    });
};

App._viewUserDetail = function (uid) {
    var modal = document.getElementById('user-detail-modal');
    var body = document.getElementById('user-detail-body');
    body.innerHTML = '<div class="py-10 flex justify-center"><div class="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>';
    modal.classList.remove('hidden');

    App._db.collection('users').doc(uid).get().then(function (doc) {
        if (!doc.exists) { body.innerHTML = '<p class="text-red-500">User not found.</p>'; return; }
        var u = Object.assign({ id: uid }, doc.data());

        // Keep the table's cached copy in sync too, so it doesn't go stale again
        var idx = -1;
        for (var i = 0; i < App._allUsers.length; i++) { if (App._allUsers[i].id === uid) { idx = i; break; } }
        if (idx > -1) App._allUsers[idx] = u; else App._allUsers.push(u);

        // Render every core admin control immediately - never depends on the
        // watch-history query below, so it can't be blocked by it.
        App._renderUserDetailBody(u, null);

        App._db.collection('watchLogs').where('uid', '==', uid).orderBy('ts', 'desc').limit(100).get()
            .then(function (snap) {
                var logs = snap.docs.map(function (d) { return d.data(); });
                App._renderWatchHistorySection(logs, null);
            })
            .catch(function (e) {
                console.error('Failed to load watch history - check the error above for details (often a missing Firestore index):', e);
                App._renderWatchHistorySection([], 'Failed to load watch history. Check the browser console for the specific error.');
            });
    }).catch(function (e) {
        console.error('Failed to load user', e);
        body.innerHTML = '<p class="text-red-500">Failed to load user. Check the browser console for the specific error.</p>';
    });
};

App._renderUserDetailBody = function (u, logs) {
    var body = document.getElementById('user-detail-body');
    var banned = App.isCurrentlyBanned(u);
    var pending = u.approved === false;
    var lastIp = u.lastIp || '—';

    var profiles = u.profiles || [];
    var profileData = u.profileData || {};
    var profilesHtml = profiles.length
        ? profiles.map(function (p) {
            var pd = profileData[p.id] || {};
            var wl = (pd.watchlist || []).length;
            var prog = Object.keys(pd.progress || {}).length;
            return '<li>' + (p.avatar || '👤') + ' <strong>' + p.name + '</strong>' + (p.isKids ? ' <span class="text-[10px] text-primary font-bold">KIDS</span>' : '') + ' — ' + wl + ' saved, ' + prog + ' in progress</li>';
        }).join('')
        : '<li class="text-zinc-500">No profiles yet (account not activated)</li>';
    var restrictedHtml = (u.restrictedTitles || []).length
        ? u.restrictedTitles.map(function (r) {
            return '<li class="flex items-center justify-between gap-2"><span>' + r.title + '</span>' +
                '<button class="restriction-remove-btn text-red-500 text-xs font-bold hover:underline" data-uid="' + u.id + '" data-item-id="' + r.id + '">Remove</button></li>';
        }).join('')
        : '<li class="text-zinc-500">No restrictions</li>';

    body.innerHTML =
        '<div class="flex items-start justify-between gap-4 mb-1 flex-wrap">' +
            '<h3 class="text-xl font-black text-black dark:text-white">' + (u.username || u.email || '—') + '</h3>' +
            '<div class="flex gap-2">' +
                (pending ? '<span class="text-xs font-bold px-2 py-1 rounded bg-yellow-500/10 text-yellow-500">Pending Approval</span>' : '') +
                (banned ? '<span class="text-xs font-bold px-2 py-1 rounded bg-red-500/10 text-red-500">' + (u.blockedUntil ? 'Banned until ' + fmtDateTime(u.blockedUntil) : 'Banned forever') + '</span>' : (!pending ? '<span class="text-xs font-bold px-2 py-1 rounded bg-green-500/10 text-green-500">Active</span>' : '')) +
            '</div>' +
        '</div>' +
        '<p class="text-xs text-zinc-500 mb-6">' + u.email + ' · Joined ' + fmtDate(u.createdAt) + ' · Last active ' + fmtDateTime(u.lastActiveAt) + ' · Last IP: ' + lastIp + '</p>' +

        (pending ? '<div class="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-8 flex items-center justify-between gap-4 flex-wrap">' +
            '<p class="text-sm text-yellow-600 dark:text-yellow-400 font-bold">This account can\'t sign in until you approve it.</p>' +
            '<button id="admin-approve-btn" class="bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-xl">Approve Account</button>' +
        '</div>' : '') +

        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">' +
            '<div class="bg-black/5 dark:bg-white/5 rounded-xl p-4">' +
                '<h4 class="font-bold text-black dark:text-white mb-3 text-sm">Edit Username</h4>' +
                '<div class="flex gap-2">' +
                    '<input id="admin-username-input" type="text" value="' + (u.username || '') + '" class="flex-1 h-10 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-3 text-sm text-black dark:text-white outline-none focus:border-primary">' +
                    '<button id="admin-username-save-btn" class="bg-primary text-white text-xs font-bold px-4 rounded-lg">Save</button>' +
                '</div>' +
            '</div>' +
            '<div class="bg-black/5 dark:bg-white/5 rounded-xl p-4">' +
                '<h4 class="font-bold text-black dark:text-white mb-3 text-sm">Password</h4>' +
                '<button id="admin-reset-pw-btn" class="bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-bold px-4 h-10 rounded-lg w-full">Send Password Reset Email</button>' +
            '</div>' +
        '</div>' +

        '<div class="bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-8">' +
            '<h4 class="font-bold text-black dark:text-white mb-3 text-sm">Ban / Suspend</h4>' +
            (banned ? '<p class="text-xs text-orange-500 mb-3">Currently banned' + (u.banReason ? ' — Reason: ' + u.banReason : '') + '</p>' : '') +
            '<input id="admin-ban-reason" type="text" placeholder="Reason (optional, shown to the user)" class="w-full h-10 mb-3 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-3 text-sm text-black dark:text-white outline-none focus:border-primary">' +
            '<div class="flex flex-wrap gap-2 mb-3">' +
                '<button class="ban-btn bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-bold px-3 py-2 rounded-lg" data-days="1">1 Day</button>' +
                '<button class="ban-btn bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-bold px-3 py-2 rounded-lg" data-days="7">7 Days</button>' +
                '<button class="ban-btn bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-bold px-3 py-2 rounded-lg" data-days="30">30 Days</button>' +
                '<button class="ban-btn bg-red-500/10 text-red-500 text-xs font-bold px-3 py-2 rounded-lg" data-days="forever">Forever</button>' +
                (banned ? '<button id="admin-unban-btn" class="bg-green-500/10 text-green-500 text-xs font-bold px-3 py-2 rounded-lg">Unban</button>' : '') +
            '</div>' +
            '<div class="flex flex-wrap gap-2 items-center">' +
                '<input id="admin-ban-custom-date" type="datetime-local" class="flex-1 min-w-[180px] h-10 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-3 text-sm text-black dark:text-white outline-none focus:border-primary">' +
                '<button id="admin-ban-custom-btn" class="bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-bold px-4 h-10 rounded-lg whitespace-nowrap">Ban Until This Date</button>' +
            '</div>' +
        '</div>' +

        '<div class="bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-8">' +
            '<h4 class="font-bold text-black dark:text-white mb-3 text-sm">Restrict Titles From This User</h4>' +
            '<div class="flex gap-2 mb-3">' +
                '<input id="admin-restrict-search" type="text" placeholder="Search a movie or show..." class="flex-1 h-10 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-3 text-sm text-black dark:text-white outline-none focus:border-primary">' +
                '<button id="admin-restrict-search-btn" class="bg-primary text-white text-xs font-bold px-4 rounded-lg">Search</button>' +
            '</div>' +
            '<div id="admin-restrict-results" class="flex flex-col gap-1 mb-3 text-sm"></div>' +
            '<h5 class="text-xs font-bold text-zinc-500 uppercase mb-2">Currently Restricted</h5>' +
            '<ul id="admin-restricted-list" class="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">' + restrictedHtml + '</ul>' +
        '</div>' +

        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-8">' +
            '<div><h4 class="font-bold text-black dark:text-white mb-2">Profiles</h4><ul class="space-y-1.5 text-zinc-600 dark:text-zinc-400">' + profilesHtml + '</ul></div>' +
            '<div><h4 id="admin-history-heading" class="font-bold text-black dark:text-white mb-2">Watch History</h4>' +
                '<div id="admin-history-body" class="text-zinc-600 dark:text-zinc-400"><div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>' +
            '</div>' +
        '</div>' +

        '<div class="border-t border-red-500/20 pt-5 flex flex-col gap-5">' +
            '<h4 class="font-bold text-red-500 text-sm">Danger Zone</h4>' +
            '<div>' +
                '<p class="text-xs text-zinc-500 mb-3">Wipes their watchlist, continue-watching, recently-viewed, and all profiles across the account. Does NOT ban them - their account stays active and they can sign back in with a completely clean slate.</p>' +
                '<button id="admin-wipe-btn" class="bg-orange-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg">Wipe All Data</button>' +
            '</div>' +
            '<div>' +
                '<p class="text-xs text-zinc-500 mb-3">Permanently removes this account from the system entirely - not a ban, an actual deletion. They can never sign in again. Their Firebase Auth login technically can\'t be removed by a browser-only app (that needs server-level access), but this makes them fully and permanently gone from everywhere the app itself controls.</p>' +
                '<button id="admin-delete-account-btn" class="bg-red-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg">Delete Account Entirely</button>' +
            '</div>' +
        '</div>';

    App._wireUserDetailActions(u);
};

/* Watch history renders independently - if this query fails (e.g. a missing
   Firestore index), it only affects this one section, never the ban/edit/
   restrict/delete controls above, which are already rendered by this point. */
App._renderWatchHistorySection = function (logs, errorMsg) {
    var heading = document.getElementById('admin-history-heading');
    var el = document.getElementById('admin-history-body');
    if (!el) return; // modal was closed before this resolved
    if (errorMsg) {
        el.innerHTML = '<p class="text-red-500 text-xs">' + errorMsg + '</p>';
        return;
    }
    if (heading) heading.innerText = 'Watch History (' + logs.length + ')';
    var logsHtml = logs.length
        ? logs.map(function (l) {
            var ep = l.mediaType === 'tv' && l.season ? ' (S' + l.season + ':E' + l.episode + ')' : '';
            return '<li>' + l.title + ep + ' <span class="text-zinc-500">- ' + fmtDateTime(l.ts) + (l.ip ? ' · ' + l.ip : '') + '</span></li>';
        }).join('')
        : '<li class="text-zinc-500">No watch history logged</li>';
    el.innerHTML = '<ul class="space-y-1 text-sm max-h-64 overflow-y-auto custom-scrollbar pr-2">' + logsHtml + '</ul>';
};

App._wireUserDetailActions = function (u) {
    var refreshTable = function () { App._renderUsersTable(document.getElementById('user-search-input').value.trim().toLowerCase()); };
    var reopen = function () { App._viewUserDetail(u.id); };

    var approveBtn = document.getElementById('admin-approve-btn');
    if (approveBtn) approveBtn.addEventListener('click', function () {
        approveBtn.disabled = true; approveBtn.innerText = 'Approving...';
        App.adminApproveUser(u.id, u.email).then(function () {
            u.approved = true;
            App.showToast('Account approved - confirmation email sent to ' + u.email);
            refreshTable(); reopen();
        }).catch(function (e) {
            console.error(e);
            App.showToast('Failed to approve account.');
            approveBtn.disabled = false; approveBtn.innerText = 'Approve Account';
        });
    });

    document.getElementById('admin-username-save-btn').addEventListener('click', function () {
        var val = document.getElementById('admin-username-input').value.trim();
        App.adminUpdateUsernameFor(u.id, val).then(function () {
            u.username = val;
            App.showToast('Username updated');
            refreshTable(); reopen();
        }).catch(function (e) { console.error(e); App.showToast('Failed to update username.'); });
    });

    document.getElementById('admin-reset-pw-btn').addEventListener('click', function () {
        App.adminSendPasswordReset(u.email).then(function () {
            App.showToast('Password reset email sent to ' + u.email);
        }).catch(function (e) { console.error(e); App.showToast('Failed to send reset email.'); });
    });

    document.querySelectorAll('.ban-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var days = btn.getAttribute('data-days');
            var reason = document.getElementById('admin-ban-reason').value.trim();
            if (!confirm('Ban ' + (u.username || u.email) + (days === 'forever' ? ' forever' : ' for ' + days + ' day(s)') + '?')) return;
            App.adminBanUser(u.id, days, reason).then(function () {
                App.showToast('User banned');
                App._loadAdminUsers();
                setTimeout(reopen, 400);
            }).catch(function (e) { console.error(e); App.showToast('Failed to ban user.'); });
        });
    });

    var customBanBtn = document.getElementById('admin-ban-custom-btn');
    if (customBanBtn) customBanBtn.addEventListener('click', function () {
        var val = document.getElementById('admin-ban-custom-date').value;
        if (!val) { App.showToast('Pick a date and time first.'); return; }
        var untilDate = new Date(val);
        if (isNaN(untilDate.getTime()) || untilDate.getTime() <= Date.now()) {
            App.showToast('Pick a date/time in the future.');
            return;
        }
        var reason = document.getElementById('admin-ban-reason').value.trim();
        if (!confirm('Ban ' + (u.username || u.email) + ' until ' + untilDate.toLocaleString() + '?')) return;
        App.adminBanUser(u.id, untilDate, reason).then(function () {
            App.showToast('User banned');
            App._loadAdminUsers();
            setTimeout(reopen, 400);
        }).catch(function (e) { console.error(e); App.showToast('Failed to ban user.'); });
    });

    var unbanBtn = document.getElementById('admin-unban-btn');
    if (unbanBtn) unbanBtn.addEventListener('click', function () {
        App.adminUnbanUser(u.id).then(function () {
            App.showToast('User unbanned');
            App._loadAdminUsers();
            setTimeout(reopen, 400);
        }).catch(function (e) { console.error(e); App.showToast('Failed to unban user.'); });
    });

    document.getElementById('admin-wipe-btn').addEventListener('click', function () {
        if (!confirm('This wipes the watchlist, continue-watching, history, and all profiles for ' + (u.username || u.email) + '. Their account stays active and they can sign back in with a clean slate. Continue?')) return;
        App.adminWipeUserData(u.id).then(function () {
            App.showToast('All data wiped');
            App._loadAdminUsers();
            setTimeout(reopen, 400);
        }).catch(function (e) { console.error(e); App.showToast('Failed to wipe user data.'); });
    });

    document.getElementById('admin-delete-account-btn').addEventListener('click', function () {
        if (!confirm('This permanently deletes ' + (u.username || u.email) + ' from the system. Their account record is fully removed and they can never sign in again.\n\nNote: their email will still show as "in use" if someone tries to sign up again with it - fully freeing it requires manually deleting them from Firebase Console \u2192 Authentication too.\n\nContinue?')) return;
        App.adminDeleteAccountEntirely(u.id, u.email).then(function () {
            App.showToast('Deleted. Note: that email still can\'t re-sign-up unless also removed in Firebase Console → Authentication.');
            App._loadAdminUsers();
            App.closeUserDetailModal();
        }).catch(function (e) { console.error(e); App.showToast('Failed to delete account.'); });
    });

    var runRestrictSearch = function () {
        var q = document.getElementById('admin-restrict-search').value.trim();
        var resultsEl = document.getElementById('admin-restrict-results');
        if (!q) return;
        resultsEl.innerHTML = '<p class="text-zinc-500 text-xs">Searching...</p>';
        App.fetchJSON(App.BASE_URL + '/search/multi?api_key=' + App.API_KEY + '&query=' + encodeURIComponent(q) + '&include_adult=false')
            .then(function (data) {
                var items = (data.results || []).filter(function (it) { return it.media_type === 'movie' || it.media_type === 'tv'; }).slice(0, 8);
                if (!items.length) { resultsEl.innerHTML = '<p class="text-zinc-500 text-xs">No results.</p>'; return; }
                resultsEl.innerHTML = items.map(function (it) {
                    var title = it.title || it.name;
                    return '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-black/5 dark:hover:bg-white/10">' +
                        '<span class="truncate">' + title + ' <span class="text-zinc-500 text-xs">(' + it.media_type + ')</span></span>' +
                        '<button class="restrict-add-btn text-primary text-xs font-bold hover:underline flex-shrink-0 ml-2" data-item-id="' + it.id + '" data-media-type="' + it.media_type + '" data-title="' + title.replace(/"/g, '&quot;') + '">Restrict</button>' +
                    '</div>';
                }).join('');
                resultsEl.querySelectorAll('.restrict-add-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var item = { id: btn.getAttribute('data-item-id'), media_type: btn.getAttribute('data-media-type'), title: btn.getAttribute('data-title') };
                        App.adminAddRestriction(u.id, item).then(function (list) {
                            u.restrictedTitles = list;
                            App.showToast('Title restricted for this user');
                            reopen();
                        }).catch(function (e) { console.error(e); App.showToast('Failed to add restriction.'); });
                    });
                });
            })
            .catch(function () { resultsEl.innerHTML = '<p class="text-red-500 text-xs">Search failed.</p>'; });
    };
    document.getElementById('admin-restrict-search-btn').addEventListener('click', runRestrictSearch);
    document.getElementById('admin-restrict-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runRestrictSearch(); } });

    document.querySelectorAll('.restriction-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var itemId = btn.getAttribute('data-item-id');
            App.adminRemoveRestriction(u.id, itemId).then(function (list) {
                u.restrictedTitles = list;
                App.showToast('Restriction removed');
                reopen();
            }).catch(function (e) { console.error(e); App.showToast('Failed to remove restriction.'); });
        });
    });
};
App.closeUserDetailModal = function () { document.getElementById('user-detail-modal').classList.add('hidden'); };

/* ============================================================
   ADD USER (creates a real Firebase Auth account from the admin panel)
   ============================================================ */
App.openAddUserModal = function () {
    document.getElementById('add-user-error').classList.add('hidden');
    document.getElementById('add-user-form').reset();
    document.getElementById('add-user-modal').classList.remove('hidden');
};
App.closeAddUserModal = function () { document.getElementById('add-user-modal').classList.add('hidden'); };
App.submitAddUser = function (e) {
    e.preventDefault();
    var email = document.getElementById('add-user-email').value.trim();
    var password = document.getElementById('add-user-password').value;
    var username = document.getElementById('add-user-username').value.trim();
    var errEl = document.getElementById('add-user-error');
    var btn = document.getElementById('add-user-submit-btn');
    errEl.classList.add('hidden');
    btn.disabled = true; btn.innerText = 'Creating...';

    App.adminCreateUser(email, password, username).then(function () {
        App.showToast('User created');
        App.closeAddUserModal();
        App._loadAdminUsers();
    }).catch(function (err) {
        var code = (err && err.code) || '';
        var msg = 'Something went wrong.';
        if (code.indexOf('email-already-in-use') > -1) msg = 'That email is already registered.';
        else if (code.indexOf('weak-password') > -1) msg = 'Password should be at least 6 characters.';
        else if (code.indexOf('invalid-email') > -1) msg = 'That email address looks invalid.';
        errEl.innerText = msg;
        errEl.classList.remove('hidden');
    }).finally(function () {
        btn.disabled = false; btn.innerText = 'Create User';
    });
};

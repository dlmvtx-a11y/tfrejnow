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
    });
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
    var blockedUsers = users.filter(function (u) { return u.blocked; }).length;
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
    if (filter) list = list.filter(function (u) { return (u.email || '').toLowerCase().indexOf(filter) > -1; });

    var body = document.getElementById('users-table-body');
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-zinc-500">No users found.</td></tr>'; return; }

    body.innerHTML = list.map(function (u) {
        var wlCount = (u.watchlist || []).length;
        var progCount = Object.keys(u.progress || {}).length;
        return '' +
            '<tr class="border-b border-black/5 dark:border-white/5">' +
                '<td class="py-3 px-3 font-bold text-black dark:text-white">' + (u.email || '—') + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + fmtDate(u.createdAt) + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + fmtDateTime(u.lastActiveAt) + '</td>' +
                '<td class="py-3 px-3 text-zinc-500">' + wlCount + ' saved · ' + progCount + ' in progress</td>' +
                '<td class="py-3 px-3">' + (u.blocked ? '<span class="text-red-500 font-bold text-xs">Blocked</span>' : '<span class="text-green-500 font-bold text-xs">Active</span>') + '</td>' +
                '<td class="py-3 px-3 text-right whitespace-nowrap">' +
                    '<button onclick="App._viewUserDetail(\'' + u.id + '\')" class="text-xs font-bold text-primary hover:underline mr-3">View</button>' +
                    '<button onclick="App._toggleBlockUser(\'' + u.id + '\', ' + (!u.blocked) + ')" class="text-xs font-bold ' + (u.blocked ? 'text-green-500' : 'text-red-500') + ' hover:underline">' + (u.blocked ? 'Unblock' : 'Block') + '</button>' +
                '</td>' +
            '</tr>';
    }).join('');
};

App._toggleBlockUser = function (uid, block) {
    App._db.collection('users').doc(uid).set({ blocked: block }, { merge: true }).then(function () {
        var u = App._allUsers.filter(function (x) { return x.id === uid; })[0];
        if (u) u.blocked = block;
        App._renderUsersTable(document.getElementById('user-search-input').value.trim().toLowerCase());
        App.showToast(block ? 'User blocked' : 'User unblocked');
    }).catch(function (e) { console.error(e); App.showToast('Failed to update user.'); });
};

App._viewUserDetail = function (uid) {
    var u = App._allUsers.filter(function (x) { return x.id === uid; })[0];
    if (!u) return;

    var modal = document.getElementById('user-detail-modal');
    var body = document.getElementById('user-detail-body');
    body.innerHTML = '<div class="py-10 flex justify-center"><div class="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>';
    modal.classList.remove('hidden');

    App._db.collection('watchLogs').where('uid', '==', uid).orderBy('ts', 'desc').limit(20).get()
        .then(function (snap) {
            var logs = snap.docs.map(function (d) { return d.data(); });
            var watchlistHtml = (u.watchlist || []).length
                ? (u.watchlist || []).map(function (w) { return '<li>' + (w.title || w.name) + '</li>'; }).join('')
                : '<li class="text-zinc-500">Empty</li>';
            var progressHtml = Object.keys(u.progress || {}).length
                ? Object.keys(u.progress).map(function (k) { var p = u.progress[k]; return '<li>' + p.title + ' - S' + p.season + ':E' + p.episode + '</li>'; }).join('')
                : '<li class="text-zinc-500">None</li>';
            var logsHtml = logs.length
                ? logs.map(function (l) { var ep = l.mediaType === 'tv' && l.season ? ' (S' + l.season + ':E' + l.episode + ')' : ''; return '<li>' + l.title + ep + ' <span class="text-zinc-500">- ' + fmtDateTime(l.ts) + '</span></li>'; }).join('')
                : '<li class="text-zinc-500">No watch history logged</li>';

            body.innerHTML =
                '<h3 class="text-xl font-black text-black dark:text-white mb-1">' + (u.email || '—') + '</h3>' +
                '<p class="text-xs text-zinc-500 mb-6">Joined ' + fmtDate(u.createdAt) + ' · Last active ' + fmtDateTime(u.lastActiveAt) + '</p>' +
                '<div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">' +
                    '<div><h4 class="font-bold text-black dark:text-white mb-2">My List</h4><ul class="space-y-1 text-zinc-600 dark:text-zinc-400">' + watchlistHtml + '</ul></div>' +
                    '<div><h4 class="font-bold text-black dark:text-white mb-2">Continue Watching</h4><ul class="space-y-1 text-zinc-600 dark:text-zinc-400">' + progressHtml + '</ul></div>' +
                    '<div><h4 class="font-bold text-black dark:text-white mb-2">Recent Watch History</h4><ul class="space-y-1 text-zinc-600 dark:text-zinc-400">' + logsHtml + '</ul></div>' +
                '</div>';
        })
        .catch(function () { body.innerHTML = '<p class="text-red-500">Failed to load user details.</p>'; });
};
App.closeUserDetailModal = function () { document.getElementById('user-detail-modal').classList.add('hidden'); };

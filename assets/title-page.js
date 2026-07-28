'use strict';

App.currentItemData = null;
App.currentMediaType = null;
App.currentTrailerKey = null;

App.initTitlePage = function () {
    App.renderNav(null);
    App.renderFooter();
    App._wireVideasyProgressSync();

    var params = new URLSearchParams(location.search);
    var type = params.get('type');
    var id = params.get('id');
    var autoResume = params.get('resume') === '1';

    if (!type || !id) {
        document.getElementById('title-body').innerHTML = '<div class="text-center py-20 text-zinc-500 font-bold">Nothing to show - missing title reference.</div>';
        return;
    }

    App.onAuthReady(function () {
        App.fetchJSON(App.BASE_URL + '/' + type + '/' + id + '?api_key=' + App.API_KEY + '&append_to_response=credits,videos,similar,recommendations')
            .then(function (data) {
                App.currentItemData = data;
                App.currentMediaType = type;
                App.renderTitleDetails(data, type);
                if (autoResume) App.startWatching();
            })
            .catch(function () {
                document.getElementById('title-body').innerHTML = '<div class="text-center py-20 text-zinc-500 font-bold">Failed to load this title. <button onclick="location.reload()" class="text-primary font-bold hover:underline">Retry</button></div>';
            });
    });
};

App.renderTitleDetails = function (data, mediaType) {
    var id = data.id;

    if (App.applyProfileFilters) {
        var itemGenreIds = (data.genres || []).map(function (g) { return g.id; });
        var isAllowed = App.applyProfileFilters([{ genre_ids: itemGenreIds }]).length > 0;
        if (!isAllowed) {
            App.showToast('This title isn\'t available on your profile.');
            setTimeout(function () { location.href = 'index.html'; }, 800);
            return;
        }
    }

    if (mediaType === 'tv' && App.userData.progress[id]) {
        App.currentSeason = App.userData.progress[id].season;
        App.currentEpisode = App.userData.progress[id].episode;
    } else { App.currentSeason = 1; App.currentEpisode = 1; }

    App.saveRecentlyViewed(data, mediaType);

    var bg = document.getElementById('global-bg');
    if (bg && data.backdrop_path) { bg.src = App.BACKDROP_BASE + data.backdrop_path; bg.classList.remove('opacity-5'); bg.classList.add('opacity-20'); }

    document.title = (data.title || data.name || 'TfrejNOW') + ' - TfrejNOW';

    var isAnime = mediaType === 'tv' && data.original_language === 'ja' && data.genres && data.genres.some(function (g) { return g.id === 16; });

    var runtimeText = '';
    if (mediaType === 'movie' && data.runtime) {
        var h = Math.floor(data.runtime / 60), m = data.runtime % 60;
        runtimeText = (h > 0 ? h + 'h ' : '') + m + 'm';
    } else if (mediaType === 'tv' && data.episode_run_time && data.episode_run_time.length) {
        runtimeText = data.episode_run_time[0] + 'm/ep';
    }

    var typeLabel = isAnime ? 'Anime' : (mediaType === 'movie' ? 'Movie' : 'TV Show');
    var countryName = (data.production_countries && data.production_countries.length) ? data.production_countries[0].name : null;
    var seasonsEpisodesText = (mediaType === 'tv' && data.number_of_seasons)
        ? data.number_of_seasons + ' Season' + (data.number_of_seasons !== 1 ? 's' : '') + (data.number_of_episodes ? ' · ' + data.number_of_episodes + ' Episodes' : '')
        : null;

    document.getElementById('title-body').innerHTML =
        '<div class="flex flex-col md:flex-row gap-8 lg:gap-14 w-full">' +
            '<div class="w-56 sm:w-64 md:w-80 lg:w-96 flex-shrink-0 mx-auto md:mx-0"><img src="' + (data.poster_path ? App.IMG_BASE_URL + data.poster_path : App.NO_POSTER) + '" alt="" onerror="this.onerror=null;this.src=\'' + App.NO_POSTER + '\';" class="w-full rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 bg-zinc-200 dark:bg-zinc-900"></div>' +
            '<div class="flex flex-col justify-center flex-1 text-center md:text-left min-w-0">' +
                '<span class="inline-block self-center md:self-start bg-primary text-white text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded mb-3">' + typeLabel + '</span>' +
                '<h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-black dark:text-white mb-3 leading-[1.05]">' + (data.title || data.name || '') + '</h1>' +
                '<div class="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-6">' +
                    '<span class="bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded border border-black/10 dark:border-white/5">' + (data.release_date || data.first_air_date || 'N/A').substring(0, 4) + '</span>' +
                    (runtimeText ? '<span class="bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded border border-black/10 dark:border-white/5">' + runtimeText + '</span>' : '') +
                    (seasonsEpisodesText ? '<span class="bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded border border-black/10 dark:border-white/5">' + seasonsEpisodesText + '</span>' : '') +
                    (countryName ? '<span class="bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded border border-black/10 dark:border-white/5">' + countryName + '</span>' : '') +
                    (data.status ? '<span class="bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded border border-black/10 dark:border-white/5">' + data.status + '</span>' : '') +
                    '<span class="flex items-center gap-1 text-yellow-500 font-bold"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' + (data.vote_average ? data.vote_average.toFixed(1) : 'NR') + '</span>' +
                    '<span>' + (data.genres ? data.genres.map(function (g) { return g.name; }).join(', ') : '') + '</span>' +
                '</div>' +
                '<p class="text-zinc-700 dark:text-zinc-300 text-base md:text-xl leading-relaxed mb-8 max-w-3xl">' + (data.overview || 'No overview available.') + '</p>' +
                '<div class="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-12">' +
                    '<button onclick="App.startWatching()" class="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-9 py-4 rounded-xl font-bold text-lg md:text-xl shadow-lg shadow-primary/30 transition-transform transform hover:scale-105"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Watch Now</button>' +
                    '<button id="btn-watchlist" onclick="App.handleWatchlistToggle()" class="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-6 py-4 rounded-xl font-bold text-base md:text-lg"></button>' +
                    (App._trailerKeyFor(data) ? '<button onclick="App.openTrailer()" class="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-6 py-4 rounded-xl font-bold text-base md:text-lg"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Trailer</button>' : '') +
                    '<button id="btn-like" onclick="App.handleFeedback(\'like\')" class="flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white w-14 h-14 rounded-xl" aria-label="Like" title="Like"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>' +
                    '<button id="btn-dislike" onclick="App.handleFeedback(\'dislike\')" class="flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white w-14 h-14 rounded-xl" aria-label="Dislike" title="Dislike"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg></button>' +
                '</div>' +
                '<div class="w-full"><h3 class="text-xl md:text-2xl font-black text-black dark:text-white mb-5">Top Cast</h3>' + App._scrollRowShell('detail-cast') + '</div>' +
            '</div>' +
        '</div>' +
        '<div id="player-injection-target" class="w-full"></div>' +
        '<div id="similar-section" class="w-full mt-20 md:mt-28 hidden"><h3 id="similar-heading" class="text-2xl md:text-3xl font-black text-black dark:text-white mb-6 border-l-4 border-primary pl-4">Similar Titles</h3>' + App._scrollRowShell('similar-results') + '</div>' +
        '<div id="recommended-section" class="w-full mt-14 md:mt-20 hidden"><h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-6 border-l-4 border-primary pl-4">Recommended For You</h3>' + App._scrollRowShell('recommended-results') + '</div>';

    App.renderWatchlistButton();
    App.renderFeedbackButtons();
    App.renderCastRow(data);

    // Similar (type-aware; anime gets language-filtered / discover fallback)
    var similarSection = document.getElementById('similar-section');
    var similarHeading = document.getElementById('similar-heading');
    similarHeading.innerText = isAnime ? 'Similar Anime' : (mediaType === 'movie' ? 'Similar Movies' : 'Similar TV Shows');
    var similarItems = (data.similar && data.similar.results) ? data.similar.results.slice() : [];
    if (isAnime) similarItems = similarItems.filter(function (it) { return it.original_language === 'ja'; });
    var renderSimilar = function (items) {
        items = App.applyProfileFilters(items || []);
        if (items.length > 0) { similarSection.classList.remove('hidden'); App.renderCards(items.slice(0, 10), 'similar-results', mediaType, true); }
        else similarSection.classList.add('hidden');
    };
    if (similarItems.length > 0) renderSimilar(similarItems);
    else if (isAnime) {
        App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=16&with_original_language=ja&sort_by=popularity.desc')
            .then(function (d) { renderSimilar((d.results || []).filter(function (it) { return String(it.id) !== String(data.id); })); })
            .catch(function () { similarSection.classList.add('hidden'); });
    } else similarSection.classList.add('hidden');

    var recSection = document.getElementById('recommended-section');
    var recItems = App.applyProfileFilters((data.recommendations && data.recommendations.results) || []);
    if (recItems.length > 0) {
        recSection.classList.remove('hidden');
        App.renderCards(recItems.slice(0, 10), 'recommended-results', mediaType, true);
    } else recSection.classList.add('hidden');
};

App._trailerKeyFor = function (data) {
    if (!data.videos || !data.videos.results) return null;
    for (var i = 0; i < data.videos.results.length; i++) {
        var v = data.videos.results[i];
        if (v.type === 'Trailer' && v.site === 'YouTube') return v.key;
    }
    return null;
};

App.renderWatchlistButton = function () {
    var btn = document.getElementById('btn-watchlist');
    if (!btn || !App.currentItemData) return;
    var inList = App.userData.watchlist.some(function (i) { return String(i.id) === String(App.currentItemData.id); });
    if (inList) {
        btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Added to List';
        btn.className = 'flex items-center gap-2 bg-primary border border-primary text-white px-6 py-4 rounded-xl font-bold text-base md:text-lg';
    } else {
        btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Add to List';
        btn.className = 'flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-6 py-4 rounded-xl font-bold text-base md:text-lg';
    }
};
App.handleWatchlistToggle = function () {
    if (!App.currentItemData) return;
    App.toggleWatchlist(App.currentItemData, App.currentMediaType);
    setTimeout(App.renderWatchlistButton, 0);
};
App._onListsChanged = function () { App.renderWatchlistButton(); App.renderFeedbackButtons(); };

App.renderFeedbackButtons = function () {
    if (!App.currentItemData) return;
    var likeBtn = document.getElementById('btn-like');
    var dislikeBtn = document.getElementById('btn-dislike');
    if (!likeBtn || !dislikeBtn) return;
    var current = App.getFeedback(App.currentItemData.id);
    var activeCls = 'flex items-center justify-center bg-primary border border-primary text-white w-14 h-14 rounded-xl';
    var idleCls = 'flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white w-14 h-14 rounded-xl';
    likeBtn.className = current === 'like' ? activeCls : idleCls;
    dislikeBtn.className = current === 'dislike' ? activeCls : idleCls;
};
App.handleFeedback = function (value) {
    if (!App.requireAuth() || !App.currentItemData) return;
    App.setFeedback(App.currentItemData, App.currentMediaType, value)
        .then(function () { App.renderFeedbackButtons(); })
        .catch(function (e) { console.error(e); App.showToast(e.message || 'Failed to save your feedback.'); });
};

App.renderCastRow = function (data) {
    var castContainer = document.getElementById('detail-cast');
    if (!castContainer) return;
    castContainer.innerHTML = '';
    if (!data.credits || !data.credits.cast) return;
    data.credits.cast.slice(0, 10).forEach(function (actor) {
        var img = actor.profile_path ? (App.IMG_BASE_URL + actor.profile_path) : App.NO_PHOTO;
        var a = document.createElement('a');
        a.href = 'cast.html?id=' + actor.id + '&name=' + encodeURIComponent(actor.name);
        a.className = 'w-28 sm:w-32 md:w-36 flex-shrink-0 text-center block group focusable rounded';
        a.innerHTML =
            '<img src="' + img + '" onerror="this.onerror=null;this.src=\'' + App.NO_PHOTO + '\';" class="w-full aspect-[2/3] object-cover rounded-xl mb-2 border border-black/10 dark:border-white/10 bg-zinc-200 dark:bg-zinc-900 shadow group-hover:border-primary transition-colors">' +
            '<p class="text-[11px] text-black dark:text-white font-bold leading-tight line-clamp-1">' + actor.name + '</p>' +
            '<p class="text-[9px] text-zinc-500 line-clamp-1 mt-0.5">' + (actor.character || '') + '</p>';
        castContainer.appendChild(a);
    });
};

/* ---------- PLAYER ---------- */
App.startWatching = function () {
    if (!App.requireAuth()) return;
    if (!App.currentItemData) return;

    var isRestricted = (App.userData.restrictedTitles || []).some(function (r) { return String(r.id) === String(App.currentItemData.id); });
    if (isRestricted) {
        App.showToast('This title has been restricted on your account by an admin.');
        return;
    }

    var target = document.getElementById('player-injection-target');
    if (target.innerHTML.trim() === '') target.innerHTML = document.getElementById('player-template').innerHTML;

    var nextBtn = document.getElementById('btn-next-episode');
    if (App.currentMediaType === 'tv') {
        var tvSection = document.getElementById('tv-season-episodes-section');
        tvSection.classList.remove('hidden'); tvSection.classList.add('flex');
        document.getElementById('server-note').classList.remove('hidden');
        if (nextBtn) { nextBtn.classList.remove('hidden'); nextBtn.classList.add('flex'); }
        App.setupTvDetails(App.currentItemData);
        App.saveProgress(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
        App.logWatchEvent(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
    } else {
        document.getElementById('tv-season-episodes-section').classList.add('hidden');
        document.getElementById('server-note').classList.add('hidden');
        if (nextBtn) { nextBtn.classList.add('hidden'); nextBtn.classList.remove('flex'); }
        App.saveProgress(App.currentItemData, 'movie', null, null);
        App.logWatchEvent(App.currentItemData, 'movie', null, null);
    }

    App.renderServerTabs();
    App.changeServer();
    setTimeout(function () {
        var vc = document.getElementById('video-container');
        if (vc) vc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
};

App.renderServerTabs = function () {
    var tabs = document.getElementById('server-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    Object.keys(App.SERVERS).forEach(function (key) {
        var server = App.SERVERS[key];
        var btn = document.createElement('button');
        var isActive = App.currentServerKey === key;
        btn.className = 'px-6 py-3 rounded-xl font-bold text-sm md:text-base whitespace-nowrap transition-all border ' + (isActive ? 'bg-primary border-primary text-white shadow-lg' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10');
        btn.innerText = server.name;
        btn.onclick = function () { App.currentServerKey = key; localStorage.setItem('tfrej_server', key); App.renderServerTabs(); App.changeServer(); };
        tabs.appendChild(btn);
    });
};
App._wireVideasyProgressSync = function () {
    if (App._videasySyncWired) return;
    App._videasySyncWired = true;
    window.addEventListener('message', function (event) {
        if (App.currentServerKey !== 'server1') return; // only trust this from the Videasy player
        if (!App.currentItemData || typeof event.data !== 'string') return;
        var data;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        if (!data || String(data.id) !== String(App.currentItemData.id)) return;

        if (App.currentMediaType === 'tv' && data.season && data.episode) {
            var advanced = data.season !== App.currentSeason || data.episode !== App.currentEpisode;
            App.currentSeason = data.season;
            App.currentEpisode = data.episode;
            App.saveProgress(App.currentItemData, 'tv', data.season, data.episode);
            if (advanced && App.updateSeasonTabsVisual) App.updateSeasonTabsVisual();
        } else if (App.currentMediaType === 'movie') {
            App.saveProgress(App.currentItemData, 'movie', null, null);
        }
    });
};

App.changeServer = function () {
    if (!App.currentItemData || !App.currentMediaType) return;
    var iframe = document.getElementById('video-frame');
    if (iframe) iframe.src = App.SERVERS[App.currentServerKey][App.currentMediaType](App.currentItemData.id);
    App._startServerNudgeTimer();
};

/* Not real failure detection (impossible cross-origin) - just a helpful
   nudge after a while in case the video never actually started. */
App._serverNudgeTimer = null;
App._startServerNudgeTimer = function () {
    if (App._serverNudgeTimer) clearTimeout(App._serverNudgeTimer);
    App._serverNudgeTimer = setTimeout(function () {
        App.showToast('Video not loading? Try switching servers above.');
    }, 12000);
};

App.reportBrokenServer = function () {
    if (!App.requireAuth() || !App.currentItemData || !App._db) return;
    App._db.collection('serverReports').add({
        uid: App.Auth.currentUser.uid,
        email: App.Auth.currentUser.email,
        itemId: String(App.currentItemData.id),
        mediaType: App.currentMediaType,
        title: App.currentItemData.title || App.currentItemData.name || '',
        server: App.SERVERS[App.currentServerKey] ? App.SERVERS[App.currentServerKey].name : App.currentServerKey,
        season: App.currentMediaType === 'tv' ? App.currentSeason : null,
        episode: App.currentMediaType === 'tv' ? App.currentEpisode : null,
        ts: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
        App.showToast('Thanks - reported to the admin.');
    }).catch(function (e) { console.error('reportBrokenServer failed', e); App.showToast('Failed to send report.'); });
};

App.nextEpisode = function () {
    if (!App.currentItemData || App.currentMediaType !== 'tv') return;
    var seasons = (App.currentItemData.seasons || []).filter(function (s) { return s.season_number > 0; });
    var meta = seasons.filter(function (s) { return s.season_number === App.currentSeason; })[0];
    var epCount = meta ? meta.episode_count : null;
    if (epCount && App.currentEpisode < epCount) { App.currentEpisode++; }
    else {
        var nextMeta = seasons.filter(function (s) { return s.season_number === App.currentSeason + 1; })[0];
        if (nextMeta) { App.currentSeason++; App.currentEpisode = 1; }
        else { App.showToast('No more episodes available.'); return; }
    }
    App.saveProgress(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
    App.updateSeasonTabsVisual();
    App.changeServer();
    App.fetchEpisodes(App.currentItemData.id, App.currentSeason);
    App.showToast('Now playing S' + App.currentSeason + ':E' + App.currentEpisode);
};

App.markSeasonWatched = function () {
    if (!App.currentItemData || App.currentMediaType !== 'tv') return;
    var seasons = (App.currentItemData.seasons || []).filter(function (s) { return s.season_number > 0; });
    var meta = seasons.filter(function (s) { return s.season_number === App.currentSeason; })[0];
    if (!meta || !meta.episode_count) { App.showToast('Unable to mark this season watched.'); return; }
    App.currentEpisode = meta.episode_count;
    App.saveProgress(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
    App.changeServer();
    App.fetchEpisodes(App.currentItemData.id, App.currentSeason);
    App.showToast('Marked Season ' + App.currentSeason + ' as watched');
};

/* ---------- SEASONS / EPISODES ---------- */
App.setupTvDetails = function (tvData) {
    var seasons = (tvData.seasons || []).filter(function (s) { return s.season_number > 0; });
    var seasonTabs = document.getElementById('season-tabs');
    seasonTabs.innerHTML = '';

    if (!seasons.some(function (s) { return s.season_number === App.currentSeason; })) {
        App.currentSeason = seasons.length ? seasons[0].season_number : 1;
        App.currentEpisode = 1;
    }

    seasons.forEach(function (season) {
        var btn = document.createElement('button');
        btn.className = 'season-btn px-6 py-3 rounded-xl font-bold text-sm md:text-base whitespace-nowrap transition-all border bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400';
        btn.innerText = 'Season ' + season.season_number;
        btn.dataset.season = season.season_number;
        btn.onclick = function () {
            App.currentSeason = season.season_number;
            App.currentEpisode = 1;
            App.updateSeasonTabsVisual();
            App.fetchEpisodes(App.currentItemData.id, App.currentSeason);
        };
        seasonTabs.appendChild(btn);
    });

    if (seasons.length > 0) { App.updateSeasonTabsVisual(); App.fetchEpisodes(App.currentItemData.id, App.currentSeason); }
};
App.updateSeasonTabsVisual = function () {
    document.querySelectorAll('.season-btn').forEach(function (btn) {
        btn.className = 'season-btn px-6 py-3 rounded-xl font-bold text-sm md:text-base whitespace-nowrap transition-all border ' +
            (parseInt(btn.dataset.season, 10) === App.currentSeason
                ? 'bg-primary border-primary text-white shadow-lg'
                : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400');
    });
    App.updateSeasonSummary();
};
App.updateSeasonSummary = function () {
    var el = document.getElementById('season-summary');
    if (!el || !App.currentItemData) return;
    var seasons = (App.currentItemData.seasons || []).filter(function (s) { return s.season_number > 0; });
    var meta = seasons.filter(function (s) { return s.season_number === App.currentSeason; })[0];
    if (!meta) { el.innerText = ''; return; }
    var year = meta.air_date ? meta.air_date.substring(0, 4) : '';
    el.innerText = meta.episode_count + ' episodes' + (year ? ' • ' + year : '');
};
App.fetchEpisodes = function (tmdbId, seasonNumber) {
    var episodesList = document.getElementById('episodes-list');
    episodesList.innerHTML = '<div class="p-4 text-center text-zinc-500">Loading episodes...</div>';
    App.fetchJSON(App.BASE_URL + '/tv/' + tmdbId + '/season/' + seasonNumber + '?api_key=' + App.API_KEY)
        .then(function (data) {
            episodesList.innerHTML = '';
            (data.episodes || []).forEach(function (ep) {
                var stillPath = ep.still_path ? (App.IMG_BASE_URL + ep.still_path) : App.NO_STILL;
                var isActive = (ep.episode_number === App.currentEpisode && seasonNumber === App.currentSeason);

                var epDiv = document.createElement('div');
                epDiv.className = 'flex gap-4 md:gap-5 p-3 md:p-4 rounded-xl cursor-pointer transition-colors duration-300 border ' + (isActive ? 'bg-primary/10 border-primary' : 'bg-transparent border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5');
                epDiv.tabIndex = 0;
                epDiv.setAttribute('role', 'button');

                var selectEpisode = function () {
                    App.currentSeason = seasonNumber;
                    App.currentEpisode = ep.episode_number;
                    App.saveProgress(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
                    App.logWatchEvent(App.currentItemData, 'tv', App.currentSeason, App.currentEpisode);
                    App.changeServer();
                    App.fetchEpisodes(tmdbId, seasonNumber);
                    document.getElementById('video-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
                epDiv.addEventListener('click', selectEpisode);
                epDiv.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEpisode(); } });

                epDiv.innerHTML = '' +
                    '<div class="w-36 sm:w-44 md:w-60 aspect-video flex-shrink-0 bg-zinc-200 dark:bg-zinc-900 rounded-xl overflow-hidden relative border border-black/10 dark:border-white/5">' +
                        '<img src="' + stillPath + '" onerror="this.onerror=null;this.src=\'' + App.NO_STILL + '\';" class="w-full h-full object-cover">' +
                        '<div class="absolute bottom-1.5 right-1.5 bg-black/80 px-2 py-1 text-[11px] font-bold rounded text-white shadow">E' + ep.episode_number + '</div>' +
                        (isActive ? '<div class="absolute inset-0 bg-primary/30 flex items-center justify-center"><div class="bg-primary rounded-full p-2.5 shadow-lg"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div></div>' : '') +
                    '</div>' +
                    '<div class="flex flex-col justify-center flex-1 min-w-0 py-1">' +
                        '<h4 class="text-base md:text-lg font-bold ' + (isActive ? 'text-primary' : 'text-black dark:text-white') + ' truncate">' + ep.episode_number + '. ' + (ep.name || '') + '</h4>' +
                        '<p class="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2 md:line-clamp-3 leading-relaxed hidden sm:block">' + (ep.overview || 'No description available.') + '</p>' +
                    '</div>';
                episodesList.appendChild(epDiv);
                if (isActive) setTimeout(function () { epDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
            });
        })
        .catch(function () { episodesList.innerHTML = '<div class="p-4 text-center text-red-500">Failed to load episodes.</div>'; });
};

/* ---------- TRAILER ---------- */
App.openTrailer = function () {
    var key = App._trailerKeyFor(App.currentItemData || {});
    if (!key) return;
    document.getElementById('trailer-frame').src = 'https://www.youtube.com/embed/' + key + '?autoplay=1&rel=0';
    document.getElementById('trailer-modal').classList.remove('hidden');
};
App.closeTrailer = function (e) {
    if (e) e.stopPropagation();
    var modal = document.getElementById('trailer-modal');
    if (modal.classList.contains('hidden')) return;
    document.getElementById('trailer-frame').src = '';
    modal.classList.add('hidden');
};
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') App.closeTrailer(); });

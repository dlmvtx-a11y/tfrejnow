'use strict';

App.currentItemData = null;
App.currentMediaType = null;
App.currentTrailerKey = null;

App.initTitlePage = function () {
    App.renderNav(null);
    App.renderFooter();

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
                if (autoResume && type === 'tv') App.startWatching();
            })
            .catch(function () {
                document.getElementById('title-body').innerHTML = '<div class="text-center py-20 text-zinc-500 font-bold">Failed to load this title. <button onclick="location.reload()" class="text-primary font-bold hover:underline">Retry</button></div>';
            });
    });
};

App.renderTitleDetails = function (data, mediaType) {
    var id = data.id;

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

    document.getElementById('title-body').innerHTML =
        '<div class="flex flex-col md:flex-row gap-8 lg:gap-12 w-full">' +
            '<div class="w-48 md:w-72 flex-shrink-0 mx-auto md:mx-0"><img src="' + (data.poster_path ? App.IMG_BASE_URL + data.poster_path : App.NO_POSTER) + '" alt="" class="w-full rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 bg-zinc-200 dark:bg-zinc-900"></div>' +
            '<div class="flex flex-col justify-center flex-1 text-center md:text-left min-w-0">' +
                '<h1 class="text-4xl md:text-5xl lg:text-6xl font-black text-black dark:text-white mb-2 leading-tight">' + (data.title || data.name || '') + '</h1>' +
                '<div class="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-6">' +
                    '<span class="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded border border-black/10 dark:border-white/5">' + (data.release_date || data.first_air_date || 'N/A').substring(0, 4) + '</span>' +
                    (runtimeText ? '<span class="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded border border-black/10 dark:border-white/5">' + runtimeText + '</span>' : '') +
                    (data.status ? '<span class="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded border border-black/10 dark:border-white/5">' + data.status + '</span>' : '') +
                    '<span class="flex items-center gap-1 text-yellow-500 font-bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' + (data.vote_average ? data.vote_average.toFixed(1) : 'NR') + '</span>' +
                    '<span>' + (data.genres ? data.genres.map(function (g) { return g.name; }).join(', ') : '') + '</span>' +
                '</div>' +
                '<p class="text-zinc-700 dark:text-zinc-300 text-base md:text-lg leading-relaxed mb-8 max-w-3xl">' + (data.overview || 'No overview available.') + '</p>' +
                '<div class="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-10">' +
                    '<button onclick="App.startWatching()" class="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg transform hover:scale-105"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Watch Now</button>' +
                    '<button id="btn-watchlist" onclick="App.handleWatchlistToggle()" class="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-5 py-3 rounded-xl font-bold"></button>' +
                    (App._trailerKeyFor(data) ? '<button onclick="App.openTrailer()" class="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-5 py-3 rounded-xl font-bold"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Trailer</button>' : '') +
                '</div>' +
                '<div class="w-full"><h3 class="text-lg font-bold text-black dark:text-white mb-4">Top Cast</h3><div id="detail-cast" class="flex gap-4 overflow-x-auto no-scrollbar pb-4"></div></div>' +
            '</div>' +
        '</div>' +
        '<div id="player-injection-target" class="w-full"></div>' +
        '<div id="similar-section" class="w-full mt-20 hidden"><h3 id="similar-heading" class="text-xl font-bold text-black dark:text-white mb-6 border-l-4 border-primary pl-3">Similar Titles</h3><div id="similar-results" class="flex gap-4 overflow-x-auto no-scrollbar pb-4"></div></div>' +
        '<div id="recommended-section" class="w-full mt-12 hidden"><h3 class="text-xl font-bold text-black dark:text-white mb-6 border-l-4 border-primary pl-3">Recommended For You</h3><div id="recommended-results" class="flex gap-4 overflow-x-auto no-scrollbar pb-4"></div></div>';

    App.renderWatchlistButton();
    App.renderCastRow(data);

    // Similar (type-aware; anime gets language-filtered / discover fallback)
    var similarSection = document.getElementById('similar-section');
    var similarHeading = document.getElementById('similar-heading');
    similarHeading.innerText = isAnime ? 'Similar Anime' : (mediaType === 'movie' ? 'Similar Movies' : 'Similar TV Shows');
    var similarItems = (data.similar && data.similar.results) ? data.similar.results.slice() : [];
    if (isAnime) similarItems = similarItems.filter(function (it) { return it.original_language === 'ja'; });
    var renderSimilar = function (items) {
        if (items && items.length > 0) { similarSection.classList.remove('hidden'); App.renderCards(items.slice(0, 10), 'similar-results', mediaType, true); }
        else similarSection.classList.add('hidden');
    };
    if (similarItems.length > 0) renderSimilar(similarItems);
    else if (isAnime) {
        App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=16&with_original_language=ja&sort_by=popularity.desc')
            .then(function (d) { renderSimilar((d.results || []).filter(function (it) { return String(it.id) !== String(data.id); })); })
            .catch(function () { similarSection.classList.add('hidden'); });
    } else similarSection.classList.add('hidden');

    var recSection = document.getElementById('recommended-section');
    if (data.recommendations && data.recommendations.results && data.recommendations.results.length > 0) {
        recSection.classList.remove('hidden');
        App.renderCards(data.recommendations.results.slice(0, 10), 'recommended-results', mediaType, true);
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
        btn.innerHTML = '✓ Added to List';
        btn.className = 'flex items-center gap-2 bg-primary border border-primary text-white px-5 py-3 rounded-xl font-bold';
    } else {
        btn.innerHTML = '+ Add to List';
        btn.className = 'flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-5 py-3 rounded-xl font-bold';
    }
};
App.handleWatchlistToggle = function () {
    if (!App.currentItemData) return;
    App.toggleWatchlist(App.currentItemData, App.currentMediaType);
    setTimeout(App.renderWatchlistButton, 0);
};
App._onListsChanged = function () { App.renderWatchlistButton(); };

App.renderCastRow = function (data) {
    var castContainer = document.getElementById('detail-cast');
    if (!castContainer) return;
    castContainer.innerHTML = '';
    if (!data.credits || !data.credits.cast) return;
    data.credits.cast.slice(0, 10).forEach(function (actor) {
        var img = actor.profile_path ? (App.IMG_BASE_URL + actor.profile_path) : App.NO_PHOTO;
        var a = document.createElement('a');
        a.href = 'cast.html?id=' + actor.id + '&name=' + encodeURIComponent(actor.name);
        a.className = 'w-20 md:w-24 flex-shrink-0 text-center block group focusable rounded';
        a.innerHTML =
            '<img src="' + img + '" class="w-full aspect-[2/3] object-cover rounded-xl mb-2 border border-black/10 dark:border-white/10 bg-zinc-200 dark:bg-zinc-900 shadow group-hover:border-primary transition-colors">' +
            '<p class="text-[11px] text-black dark:text-white font-bold leading-tight line-clamp-1">' + actor.name + '</p>' +
            '<p class="text-[9px] text-zinc-500 line-clamp-1 mt-0.5">' + (actor.character || '') + '</p>';
        castContainer.appendChild(a);
    });
};

/* ---------- PLAYER ---------- */
App.startWatching = function () {
    if (!App.requireAuth()) return;

    var target = document.getElementById('player-injection-target');
    if (target.innerHTML.trim() === '') target.innerHTML = document.getElementById('player-template').innerHTML;

    var nextBtn = document.getElementById('btn-next-episode');
    if (App.currentMediaType === 'tv') {
        var tvSection = document.getElementById('tv-season-episodes-section');
        tvSection.classList.remove('hidden'); tvSection.classList.add('flex');
        document.getElementById('server-note').classList.remove('hidden');
        if (nextBtn) { nextBtn.classList.remove('hidden'); nextBtn.classList.add('flex'); }
        App.setupTvDetails(App.currentItemData);
    } else {
        document.getElementById('tv-season-episodes-section').classList.add('hidden');
        document.getElementById('server-note').classList.add('hidden');
        if (nextBtn) { nextBtn.classList.add('hidden'); nextBtn.classList.remove('flex'); }
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
        btn.className = 'px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border ' + (isActive ? 'bg-primary border-primary text-white shadow-lg' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10');
        btn.innerText = server.name;
        btn.onclick = function () { App.currentServerKey = key; localStorage.setItem('tfrej_server', key); App.renderServerTabs(); App.changeServer(); };
        tabs.appendChild(btn);
    });
};
App.changeServer = function () {
    if (!App.currentItemData || !App.currentMediaType) return;
    var iframe = document.getElementById('video-frame');
    if (iframe) iframe.src = App.SERVERS[App.currentServerKey][App.currentMediaType](App.currentItemData.id);
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
        btn.className = 'season-btn px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400';
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
        btn.className = 'season-btn px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border ' +
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
                epDiv.className = 'flex gap-4 p-2 md:p-3 rounded-xl cursor-pointer transition-all border ' + (isActive ? 'bg-primary/10 border-primary' : 'bg-transparent border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5');
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
                    '<div class="w-32 md:w-48 aspect-video flex-shrink-0 bg-zinc-200 dark:bg-zinc-900 rounded-lg overflow-hidden relative border border-black/10 dark:border-white/5">' +
                        '<img src="' + stillPath + '" class="w-full h-full object-cover">' +
                        '<div class="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 text-[10px] font-bold rounded text-white shadow">E' + ep.episode_number + '</div>' +
                        (isActive ? '<div class="absolute inset-0 bg-primary/30 flex items-center justify-center"><div class="bg-primary rounded-full p-2 shadow-lg"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div></div>' : '') +
                    '</div>' +
                    '<div class="flex flex-col justify-center flex-1 min-w-0 py-1">' +
                        '<h4 class="text-sm md:text-base font-bold ' + (isActive ? 'text-primary' : 'text-black dark:text-white') + ' truncate">' + ep.episode_number + '. ' + (ep.name || '') + '</h4>' +
                        '<p class="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-2 md:line-clamp-3 leading-relaxed hidden md:block">' + (ep.overview || 'No description available.') + '</p>' +
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

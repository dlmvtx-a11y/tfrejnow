'use strict';

/* ============================================================
   HOME PAGE
   ============================================================ */
App.initHomePage = function () {
    App.renderNav('index.html');
    App.renderFooter();
    App.renderGenreBar('genre-row');
    App.wireRowDrag('genre-row');

    App._heroItems = []; App._heroIndex = 0; App._heroTimer = null;
    document.getElementById('trending-results').innerHTML = App.skeletons(10);

    App.onAuthReady(function () {
        App.renderListRows();
        App.wireHomeSearch();

        App.fetchJSON(App.BASE_URL + '/trending/all/day?api_key=' + App.API_KEY)
            .then(function (data) {
                var results = App.applyProfileFilters(data.results || []);
                App.renderCards(results.slice(0, 10), 'trending-results');
                App._heroItems = results.slice(0, 5);
                if (App._heroItems.length) { App.renderHeroDots(); App.showHero(0); App.startHeroRotation(); }
            })
            .catch(function () { document.getElementById('trending-results').innerHTML = App.retryHtml('trending-results', 'App.initHomePage'); });

        if ('IntersectionObserver' in window) {
            var targets = [
                { id: 'newweek-section', fn: App.fetchNewThisWeekRow },
                { id: 'movies-section', fn: App.fetchMoviesRow },
                { id: 'tv-section', fn: App.fetchTvRow },
                { id: 'anime-section', fn: App.fetchAnimeRow }
            ];
            var loaded = {};
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var match = targets.filter(function (t) { return t.id === entry.target.id; })[0];
                    if (match && !loaded[match.id]) { loaded[match.id] = true; match.fn(); observer.unobserve(entry.target); }
                });
            }, { rootMargin: '400px' });
            targets.forEach(function (t) { var el = document.getElementById(t.id); if (el) observer.observe(el); });
        } else {
            App.fetchNewThisWeekRow(); App.fetchMoviesRow(); App.fetchTvRow(); App.fetchAnimeRow();
        }
    });

    var hero = document.getElementById('hero-section');
    if (hero) {
        hero.addEventListener('mouseenter', App.stopHeroRotation);
        hero.addEventListener('mouseleave', function () { if (App._heroItems.length) App.startHeroRotation(); });
    }
};

App.fetchNewThisWeekRow = function () {
    document.getElementById('newweek-results').innerHTML = App.skeletons(10);
    App.fetchJSON(App.BASE_URL + '/movie/now_playing?api_key=' + App.API_KEY + '&region=US')
        .then(function (d) { App.renderCards(App.applyProfileFilters(d.results || []).slice(0, 10), 'newweek-results', 'movie'); })
        .catch(function () { document.getElementById('newweek-results').innerHTML = App.retryHtml('newweek-results', 'App.fetchNewThisWeekRow'); });
};

App.fetchMoviesRow = function () {
    document.getElementById('movies-results').innerHTML = App.skeletons(10);
    App.fetchJSON(App.BASE_URL + '/discover/movie?api_key=' + App.API_KEY + '&sort_by=popularity.desc')
        .then(function (d) { App.renderCards(App.applyProfileFilters(d.results || []).slice(0, 10), 'movies-results', 'movie'); })
        .catch(function () { document.getElementById('movies-results').innerHTML = App.retryHtml('movies-results', 'App.fetchMoviesRow'); });
};
App.fetchTvRow = function () {
    document.getElementById('tv-results').innerHTML = App.skeletons(10);
    App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&sort_by=popularity.desc')
        .then(function (d) { App.renderCards(App.applyProfileFilters(d.results || []).slice(0, 10), 'tv-results', 'tv'); })
        .catch(function () { document.getElementById('tv-results').innerHTML = App.retryHtml('tv-results', 'App.fetchTvRow'); });
};
App.fetchAnimeRow = function () {
    document.getElementById('anime-results').innerHTML = App.skeletons(10);
    App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=16&with_original_language=ja&sort_by=popularity.desc')
        .then(function (d) { App.renderCards(App.applyProfileFilters(d.results || []).slice(0, 10), 'anime-results', 'tv'); })
        .catch(function () { document.getElementById('anime-results').innerHTML = App.retryHtml('anime-results', 'App.fetchAnimeRow'); });
};

App.renderListRows = function () {
    App._ensureRowShell('continue-results-shell', 'continue-results');
    App._ensureRowShell('recent-results-shell', 'recent-results');
    App._ensureRowShell('watchlist-results-shell', 'watchlist-results');

    var cont = document.getElementById('continue-section');
    var contArr = Object.keys(App.userData.progress).map(function (k) { return App.userData.progress[k]; }).sort(function (a, b) { return b.ts - a.ts; });
    if (cont) {
        if (contArr.length) { cont.classList.remove('hidden'); App.renderCards(contArr, 'continue-results', null, true, false, 'continue'); }
        else cont.classList.add('hidden');
    }
    var recent = document.getElementById('recent-section');
    if (recent) {
        var showRecent = App.userData.showRecentlyViewed !== false; // defaults to true
        var recentArr = showRecent ? (App.userData.recent || []).slice(0, 10) : [];
        if (recentArr.length) { recent.classList.remove('hidden'); App.renderCards(recentArr, 'recent-results', null, true); }
        else recent.classList.add('hidden');
    }
    var wl = document.getElementById('watchlist-section');
    if (wl) {
        if (App.userData.watchlist.length) { wl.classList.remove('hidden'); App.renderCards(App.userData.watchlist, 'watchlist-results', null, true, false, 'watchlist'); }
        else wl.classList.add('hidden');
    }
    App.fetchRecommendedForMeRow();
    App.fetchTopTenRows();
};
App._onListsChanged = function () { App.renderListRows(); };

App.fetchTopTenRows = function () {
    App.fetchJSON(App.BASE_URL + '/trending/movie/day?api_key=' + App.API_KEY)
        .then(function (d) { App.renderTopTenRow(App.applyProfileFilters(d.results || []), 'top10-movies-results', 'movie'); })
        .catch(function () {});
    App.fetchJSON(App.BASE_URL + '/trending/tv/day?api_key=' + App.API_KEY)
        .then(function (d) { App.renderTopTenRow(App.applyProfileFilters(d.results || []), 'top10-tv-results', 'tv'); })
        .catch(function () {});
    App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=16&with_original_language=ja&sort_by=popularity.desc')
        .then(function (d) { App.renderTopTenRow(App.applyProfileFilters(d.results || []), 'top10-anime-results', 'tv'); })
        .catch(function () {});
};

App.fetchRecommendedForMeRow = function () {
    var section = document.getElementById('recommended-forme-section');
    if (!section) return;
    var genreId = App.getRecommendedGenre ? App.getRecommendedGenre() : null;
    if (!genreId) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    document.getElementById('recommended-forme-results').innerHTML = App.skeletons(10);
    var movieP = App.fetchJSON(App.BASE_URL + '/discover/movie?api_key=' + App.API_KEY + '&with_genres=' + genreId + '&sort_by=popularity.desc');
    var tvP = App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=' + genreId + '&sort_by=popularity.desc');
    Promise.all([movieP, tvP]).then(function (r) {
        var combined = (r[0].results || []).map(function (m) { m.media_type = 'movie'; return m; })
            .concat((r[1].results || []).map(function (t) { t.media_type = 'tv'; return t; }));
        combined.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
        App.renderCards(App.applyProfileFilters(combined).slice(0, 10), 'recommended-forme-results', null);
    }).catch(function () {
        document.getElementById('recommended-forme-results').innerHTML = App.retryHtml('recommended-forme-results', 'App.fetchRecommendedForMeRow');
    });
};

App.showHero = function (i) {
    App._heroIndex = i;
    var item = App._heroItems[i];
    if (!item) return;
    var heroImg = document.getElementById('hero-img');
    document.getElementById('hero-rank').innerText = '#' + (i + 1) + ' Trending Today';
    document.getElementById('hero-title').innerText = item.title || item.name || '';
    document.getElementById('hero-desc').innerText = item.overview || '';
    heroImg.classList.add('opacity-0');
    var src = item.backdrop_path ? (App.BACKDROP_BASE + item.backdrop_path) : '';
    setTimeout(function () {
        heroImg.onload = function () { document.getElementById('hero-loader').classList.add('hidden'); heroImg.classList.remove('opacity-0'); };
        heroImg.src = src;
    }, 150);
    App.updateHeroDotsActive();
    var heroLink = document.getElementById('hero-link');
    if (heroLink) heroLink.href = 'title.html?type=' + (item.media_type || 'movie') + '&id=' + item.id;
};
App.renderHeroDots = function () {
    var wrap = document.getElementById('hero-dots');
    wrap.innerHTML = '';
    App._heroItems.forEach(function (item, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'hero-dot rounded-full transition-all h-2.5';
        dot.setAttribute('aria-label', 'Show featured title ' + (i + 1));
        dot.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); App.showHero(i); App.startHeroRotation(); });
        wrap.appendChild(dot);
    });
    App.updateHeroDotsActive();
};
App.updateHeroDotsActive = function () {
    document.querySelectorAll('.hero-dot').forEach(function (dot, i) {
        dot.className = 'hero-dot rounded-full transition-all h-2.5 ' + (i === App._heroIndex ? 'bg-primary w-6' : 'bg-white/50 hover:bg-white/80 w-2.5');
    });
};
App.startHeroRotation = function () {
    App.stopHeroRotation();
    if (App._heroItems.length < 2) return;
    App._heroTimer = setInterval(function () { App.showHero((App._heroIndex + 1) % App._heroItems.length); }, App.HERO_ROTATE_MS);
};
App.stopHeroRotation = function () { if (App._heroTimer) clearInterval(App._heroTimer); App._heroTimer = null; };

App.wireHomeSearch = function () {
    var input = document.getElementById('search-input');
    if (!input) return;
    var t;
    input.addEventListener('input', function (e) {
        var q = e.target.value.trim();
        clearTimeout(t);
        if (!q) return;
        t = setTimeout(function () { location.href = 'search.html?q=' + encodeURIComponent(q); }, 500);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && input.value.trim()) location.href = 'search.html?q=' + encodeURIComponent(input.value.trim());
    });
};

/* ============================================================
   GENERIC BROWSE PAGE (trending/movies/tvshow/anime/genre/search/cast)
   ============================================================ */
App._browsePage = 1;
App._browseFetcher = null;

App.initSectionPage = function (key, navHref) {
    App.renderNav(navHref);
    App.renderFooter();
    var cfg = App.SECTION_CONFIG[key];
    document.getElementById('browse-title').innerText = cfg.label;
    App._runBrowse(function (page) {
        return App.fetchJSON(cfg.url(page)).then(function (data) {
            return (data.results || []).map(function (item) { if (cfg.mediaType && !item.media_type) item.media_type = cfg.mediaType; return item; });
        });
    });
};

App.initGenrePage = function () {
    App.renderNav(null);
    App.renderFooter();
    var params = new URLSearchParams(location.search);
    var m = params.get('m'), t = params.get('t'), name = params.get('name') || 'Genre';
    document.getElementById('browse-title').innerText = 'Browsing: ' + name;
    App._runBrowse(function (page) {
        var movieP = m ? App.fetchJSON(App.BASE_URL + '/discover/movie?api_key=' + App.API_KEY + '&with_genres=' + m + '&page=' + page + '&sort_by=popularity.desc') : Promise.resolve({ results: [] });
        var tvP = t ? App.fetchJSON(App.BASE_URL + '/discover/tv?api_key=' + App.API_KEY + '&with_genres=' + t + '&page=' + page + '&sort_by=popularity.desc') : Promise.resolve({ results: [] });
        return Promise.all([movieP, tvP]).then(function (r) {
            var combined = (r[0].results || []).map(function (x) { x.media_type = 'movie'; return x; })
                .concat((r[1].results || []).map(function (x) { x.media_type = 'tv'; return x; }));
            combined.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
            return combined;
        });
    });
};

App.initSearchPage = function () {
    App.renderNav(null);
    App.renderFooter();
    var params = new URLSearchParams(location.search);
    var q = params.get('q') || '';
    var input = document.getElementById('search-input');
    if (input) {
        input.value = q;
        var t;
        input.addEventListener('input', function (e) {
            var newQ = e.target.value.trim();
            clearTimeout(t);
            t = setTimeout(function () {
                if (!newQ) return;
                history.replaceState(null, '', 'search.html?q=' + encodeURIComponent(newQ));
                document.getElementById('browse-title').innerText = 'Search Results for "' + newQ + '"';
                App.logSearch(newQ);
                App._runBrowse(function () {
                    return App.fetchJSON(App.BASE_URL + '/search/multi?api_key=' + App.API_KEY + '&query=' + encodeURIComponent(newQ) + '&language=en-US&page=1&include_adult=false')
                        .then(function (d) { return (d.results || []).filter(function (it) { return it.media_type === 'movie' || it.media_type === 'tv'; }); });
                }, true);
            }, 500);
        });
    }
    if (q) {
        document.getElementById('browse-title').innerText = 'Search Results for "' + q + '"';
        App.logSearch(q);
        App._runBrowse(function () {
            return App.fetchJSON(App.BASE_URL + '/search/multi?api_key=' + App.API_KEY + '&query=' + encodeURIComponent(q) + '&language=en-US&page=1&include_adult=false')
                .then(function (d) { return (d.results || []).filter(function (it) { return it.media_type === 'movie' || it.media_type === 'tv'; }); });
        }, true);
    } else {
        document.getElementById('browse-title').innerText = 'Search';
        document.getElementById('browse-loading').classList.add('hidden');
    }
};

App.initCastPage = function () {
    App.renderNav(null);
    App.renderFooter();
    var params = new URLSearchParams(location.search);
    var id = params.get('id'), name = params.get('name') || 'Actor';
    document.getElementById('browse-title').innerText = 'Appearances: ' + name;
    App._runBrowse(function (page) {
        if (page > 1) return Promise.resolve([]); // combined_credits isn't paginated
        return App.fetchJSON(App.BASE_URL + '/person/' + id + '/combined_credits?api_key=' + App.API_KEY).then(function (data) {
            var cast = (data.cast || []).filter(function (c) { return c.media_type === 'movie' || c.media_type === 'tv'; });
            cast.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
            return cast.slice(0, 40);
        });
    });
};

App._runBrowse = function (pageFetcher, noAutoLoad) {
    App._browsePage = 1;
    App._browseFetcher = pageFetcher;
    document.getElementById('browse-results').innerHTML = '';
    document.getElementById('browse-loading').classList.remove('hidden');
    document.getElementById('load-more-btn').classList.add('hidden');
    App.onAuthReady(function () { App._loadBrowsePage(true); });
};
App._loadBrowsePage = function (isNew) {
    if (!App._browseFetcher) return Promise.resolve();
    return App._browseFetcher(App._browsePage).then(function (combined) {
        combined = App.applyProfileFilters(combined);
        document.getElementById('browse-loading').classList.add('hidden');
        if (isNew) document.getElementById('browse-results').innerHTML = '';
        if (isNew && combined.length === 0) {
            document.getElementById('browse-results').innerHTML = '<div class="col-span-full text-center text-zinc-500 py-10 font-bold">No results found.</div>';
        } else {
            App.renderCards(combined, 'browse-results', null, false, !isNew);
        }
        document.getElementById('load-more-btn').classList.toggle('hidden', combined.length === 0);
    }).catch(function () {
        document.getElementById('browse-loading').classList.add('hidden');
        if (isNew) document.getElementById('browse-results').innerHTML = '<div class="col-span-full text-center text-zinc-500 py-10 font-bold">Failed to load. Please try again.</div>';
        document.getElementById('load-more-btn').classList.add('hidden');
    });
};
App.loadMoreBrowse = function () {
    App._browsePage++;
    var btn = document.getElementById('load-more-btn');
    btn.disabled = true; btn.innerText = 'Loading...';
    App._loadBrowsePage(false).then(function () { btn.disabled = false; btn.innerText = 'Load More'; });
};

/* ============================================================
   WATCHLIST / CONTINUE WATCHING PAGES (require sign-in)
   ============================================================ */
App.initListsPage = function (kind) {
    App.renderNav(kind === 'watchlist' ? 'watchlist.html' : 'continue-watching.html');
    App.renderFooter();
    App.onAuthReady(function (user) {
        if (!user) {
            document.getElementById('lists-body').innerHTML =
                '<div class="text-center py-20"><p class="text-zinc-500 font-bold mb-4">Sign in to see your ' + (kind === 'watchlist' ? 'saved list' : 'continue watching') + '.</p>' +
                '<a href="login.html?return=' + encodeURIComponent(location.pathname) + '" class="inline-block bg-primary text-white font-bold px-6 py-3 rounded-xl">Sign In</a></div>';
            return;
        }
        renderList();
    });
    App._onListsChanged = renderList;

    function renderList() {
        if (kind === 'watchlist') {
            var list = App.userData.watchlist;
            if (!list.length) { document.getElementById('lists-body').innerHTML = emptyMsg('Your list is empty. Add titles from any details page.'); return; }
            document.getElementById('lists-body').innerHTML = '<div id="lists-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 lg:gap-8"></div>';
            App.renderCards(list, 'lists-grid', null, false, false, 'watchlist');
        } else {
            var arr = Object.keys(App.userData.progress).map(function (k) { return App.userData.progress[k]; }).sort(function (a, b) { return b.ts - a.ts; });
            if (!arr.length) { document.getElementById('lists-body').innerHTML = emptyMsg('Nothing in progress yet. Start an episode and it will show up here.'); return; }
            document.getElementById('lists-body').innerHTML = '<div id="lists-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 lg:gap-8"></div>';
            App.renderCards(arr, 'lists-grid', null, false, false, 'continue');
        }
    }
    function emptyMsg(msg) { return '<div class="text-center py-20 text-zinc-500 font-bold">' + msg + '</div>'; }
};

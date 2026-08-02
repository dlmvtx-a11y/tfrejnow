// Changelog entries - newest first. Add a new entry to the TOP of this array
// each time a meaningful update ships.
window.CHANGELOG_ENTRIES = [
    {
        date: '2026-07-30',
        title: 'Live TV & Radio',
        items: [
            'New: 📺 Live TV - browse and watch free, publicly available channels from around the world, filterable by country and category',
            'New: 📻 Radio - search and listen to internet radio stations with a persistent mini player',
            'Both added to the main navigation'
        ]
    },
    {
        date: '2026-07-28',
        title: 'Watch Together, and a real playback bug fixed',
        items: [
            'Fixed a real bug where guests joining a watch party could end up with a blank "ghost" account showing in the admin user list',
            'Admin can now bulk-delete selected accounts, not just ban/unban them',
            'New: Help & Guide page - how to block ads for a smoother experience, and everything about the site in one place',
            'New: Watch Together now offers two modes - a synced Watch Room (chat + same starting point), or a true Live Stream where the host shares their screen and everyone watches the exact same feed in real time',
            'Live Stream mode now actually works end-to-end - fixed several real connection bugs along the way, including a duplicate connection handler and missing error visibility that made problems hard to diagnose',
            'Fixed Live Stream mode not showing the actual movie/show to the host at all - the host now gets the real player embedded to watch and control, then shares that',
            'Viewers in Live Stream mode now get real video controls - volume and fullscreen, plus a live connection quality indicator (play/pause stays host-only, since it\'s a live broadcast)',
            'Live Stream now auto-reconnects if a viewer\'s connection drops, and warns clearly (with specific guidance) if an ad-blocker or privacy extension is blocking the connection',
            'New: Voice chat in watch parties - talk to everyone in the party live, with mute control, works alongside both Watch Room and Live Stream modes',
            'Voice chat now shows who\'s actually talking in real time, and a glowing ring around the mic button when you\'re speaking',
            'Fixed fullscreen not working on some mobile browsers (iOS Safari needed a different approach)',
            'Hosts can now mute someone\'s chat too, separately from their mic - actually enforced server-side, not just a visual toggle',
            'Hosts can now mute someone\'s microphone in voice chat, not just kick them (click the "watching" count to see who\'s in)',
            'Hosts can now remove someone from a watch party (click the "watching" count to see who\'s in, with a Kick option next to each person)',
            'Opening the same watch party in two tabs at once is now handled cleanly instead of silently conflicting',
            'Hosts can now see a live preview of exactly what they\'re sharing, instead of just a text status with nothing to look at',
            'Live chat and quick reactions inside every watch party',
            'Fixed the host\'s screen-sharing button staying visible and confusing even after sharing had actually started',
            'Leaving a watch party now takes you back where you came from, and notifies everyone else if the host leaves',
            'Fixed a bug where shared watch party links wouldn\'t open',
            'Fixed a real bug where resuming Continue Watching, or starting playback on a fresh title, could silently fail with no video and no server options showing'
        ]
    },
    {
        date: '2026-07-28',
        title: 'Server lineup refresh & smoother playback',
        items: [
            'Reordered servers and added two new ones (5 total) for better reliability',
            'Fixed a fullscreen issue with one of the players',
            'Continue Watching now stays accurate automatically on supported servers, even when an episode auto-advances',
            'Added this Updates page so changes are easy to follow'
        ]
    },
    {
        date: '2026-07-27',
        title: 'Design polish and app support',
        items: [
            'Redesigned the "Who\'s Watching" screen with colorful avatars and a real Netflix-style PIN entry',
            'Nicer loading screen, smoother animations throughout the site',
            'Fixed several images not loading properly (posters, cast photos, episode thumbnails)',
            'Title pages now show whether something is a Movie, TV Show, or Anime, plus country and season/episode counts',
            'Added "Forgot Password" to the sign-in page',
            'The site can now be installed like an app on your phone or computer'
        ]
    },
    {
        date: '2026-07-25',
        title: 'Profiles, notifications, and personalized recommendations',
        items: [
            'Added Netflix-style "Who\'s Watching" profiles - up to 5 per account, with optional PINs and a Kids mode',
            'Added a notifications bell for new episodes of shows you\'re watching',
            'Added a "Recommended For You" row based on what you actually watch',
            '"Top 10 Today" rows for Movies, TV, and Anime',
            'Search bar and genre filters added to every browse page, not just the homepage'
        ]
    },
    {
        date: '2026-07-22',
        title: 'Full redesign and account system',
        items: [
            'Complete visual redesign - full-bleed hero, bigger cards, smoother everything',
            'Accounts, watchlists, and continue watching, all synced to your account'
        ]
    }
];

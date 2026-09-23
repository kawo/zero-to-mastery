document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const resetButton = document.getElementById('resetButton');
    const downloadsButton = document.getElementById('downloadsButton');
    const libraryButton = document.getElementById('libraryButton');
    const searchHistory = document.getElementById('searchHistory');
    const loader = document.getElementById('loader');
    const responseContainer = document.getElementById('response');
    const queueContainer = document.querySelector('.queue');

    // Favorites -> Library ------------------------ //
    // Favorites used to be a separate list in localStorage; they now live in
    // the Library as subscriptions. This moves any that are left, and keeps the
    // ones that can't be moved yet (offline, feed down) to retry next visit.
    // Returns how many were moved.
    async function migrateFavorites() {
        let favorites;
        try {
            favorites = JSON.parse(localStorage.getItem('favoritePodcasts')) || [];
        } catch (error) {
            favorites = [];
        }

        const remaining = [];
        for (const favorite of favorites) {
            try {
                // Favorites saved before subscriptions existed have no feed URL
                let feedUrl = favorite.url;
                if (!feedUrl) {
                    const response = await fetch(`/api/podcast?itunesId=${encodeURIComponent(favorite.itunesId)}`);
                    if (!response.ok) throw new Error(`Podcast lookup failed (${response.status})`);
                    const data = await response.json();
                    feedUrl = data.feed && data.feed.url;
                    if (!feedUrl) throw new Error('Podcast Index has no feed for it');
                }
                await Subscriptions.subscribe(feedUrl);
            } catch (error) {
                console.error(`Could not move favorite "${favorite.title}" to the Library:`, error);
                remaining.push(favorite);
            }
        }

        if (remaining.length) {
            localStorage.setItem('favoritePodcasts', JSON.stringify(remaining));
        } else {
            localStorage.removeItem('favoritePodcasts');
        }
        return favorites.length - remaining.length;
    }

    // Reset Dropdown & Input
    function resetHistory() {
        searchHistory.innerText = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Select a Previous Search';
        searchHistory.appendChild(option);
    }
    
    // Load search history from local storage when the page loads
    function loadSearchHistory() {
        const savedSearches = JSON.parse(localStorage.getItem('searchHistory')) || [];
        resetHistory();
        savedSearches.forEach(searchTerm => {
            const option = document.createElement('option');
            option.value = searchTerm;
            option.textContent = searchTerm;
            searchHistory.appendChild(option);
        });
    };
    
    // Save the search history to local storage
    const saveSearchHistory = (searchTerm) => {
        let savedSearches = JSON.parse(localStorage.getItem('searchHistory')) || [];
        if (!savedSearches.includes(searchTerm)) {
            savedSearches.push(searchTerm);
            localStorage.setItem('searchHistory', JSON.stringify(savedSearches));
        }
    };
    
    // Event listener for search button, input
    searchButton.addEventListener('click', searchPodcast);
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchPodcast();
        }
    });
    
    // Event listener for dropdown change
    searchHistory.addEventListener('change', () => {
        const selectedSearch = searchHistory.value;
        if (selectedSearch) {
            searchInput.value = selectedSearch;
            searchPodcast();
        }
    });
    
    // Event listener for reset button
    resetButton.addEventListener('click', () => {
        localStorage.removeItem('searchHistory');
        resetHistory();
        searchInput.value = '';
    });

    // Event listener to reset search input
    searchInput.addEventListener('focus', () => {
        searchInput.value = '';
    });
    
    // Load search history when the page loads
    loadSearchHistory();
    
    // Format Date
    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString();
    }

    // Episode descriptions are HTML written by whoever runs the feed, so only
    // simple formatting survives, and links can only point at web pages
    const ALLOWED_TAGS = new Set(['P', 'BR', 'A', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI']);
    const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT']);

    function sanitizeHtml(html) {
        // A parsed document is inert: nothing in it runs or loads
        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        const fragment = document.createDocumentFragment();

        const copyChildren = (source, target) => {
            source.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    target.appendChild(document.createTextNode(node.textContent));
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE || DROPPED_TAGS.has(node.tagName)) return;
                if (!ALLOWED_TAGS.has(node.tagName)) {
                    copyChildren(node, target);
                    return;
                }
                const el = document.createElement(node.tagName.toLowerCase());
                if (node.tagName === 'A') {
                    const href = node.getAttribute('href');
                    try {
                        const url = new URL(href, location.href);
                        if (url.protocol === 'http:' || url.protocol === 'https:') {
                            el.href = url.href;
                            el.target = '_blank';
                            el.rel = 'noopener noreferrer';
                        }
                    } catch (error) {
                        // Leave the link text without a link
                    }
                }
                target.appendChild(el);
                copyChildren(node, el);
            });
        };

        copyChildren(doc.body, fragment);
        return fragment;
    }

    // Show loading animation
    function showLoader() {
        loader.style.display = 'flex';
        responseContainer.style.display = 'none';
    }

    // Hide loading animation
    function hideLoader() {
        loader.style.display = 'none';
        responseContainer.style.display = 'flex';
        responseContainer.scrollTo({
            top: 0
        });
    }

    // Handle fallback image
    function handleFallbackImage(img) {
        const fallbackImage = './default-podcast.png';
        img.src = fallbackImage;
        return img;
    }

    // Any card image that fails to load (common with feed artwork) falls back
    // to the default. Error events don't bubble, so this listens in the capture phase
    responseContainer.addEventListener('error', event => {
        const img = event.target;
        if (img.tagName === 'IMG' && img.getAttribute('src') && !img.src.endsWith('/default-podcast.png')) {
            handleFallbackImage(img);
        }
    }, true);

    // Set up to load podcast / episode images
    function handleImageLoad(limit) {
        const images = responseContainer.getElementsByTagName('img');
        let imagesToLoad = Math.min(images.length, limit);

        if (imagesToLoad === 0) {
            hideLoader();
            return;
        }
    
        Array.from(images).slice(0, limit).forEach(img => {
            img.onload = img.onerror = () => {
                imagesToLoad--;
                if (img.complete && !img.naturalWidth) {
                    img = handleFallbackImage(img);
                }
                if (imagesToLoad === 0) {
                    hideLoader();
                    lazyLoadRemainingImages(limit);
                }
            };
        });
    }
    
    // Lazy load images after  initial load
    function lazyLoadRemainingImages(start) {
        const remainingImages = Array.from(responseContainer.getElementsByTagName('img')).slice(start);
    
        const lazyLoadObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    let img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.onload = img.onerror = () => {
                            if (img.complete && !img.naturalWidth) {
                                img = handleFallbackImage(img);
                            }
                            lazyLoadObserver.unobserve(img);
                        };
                    } else {
                        img = handleFallbackImage(img);
                        lazyLoadObserver.unobserve(img);
                    }
                }
            });
        });
    
        remainingImages.forEach(img => {
            lazyLoadObserver.observe(img);
        });
    }
    
    // Search Podcasts
    async function searchPodcast() {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            saveSearchHistory(searchTerm);
            loadSearchHistory();
        } else {
            responseContainer.innerText = 'Please enter a podcast title.';
            return;
        }

        showLoader();
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
            const data = await response.json();
        
            responseContainer.textContent = ''; // clear previous results
            responseContainer.dataset.view = 'search';
        
            const titles = new Set(); // Track unique titles
        
            if (data.feeds && data.feeds.length > 0) {
                data.feeds.forEach((podcast, index) => {
                    if (podcast.episodeCount > 0 && !titles.has(podcast.title)) {  // Only create cards for unique titles
                        titles.add(podcast.title);  // Add description to the set
                        const card = createCard(podcast);
                        responseContainer.appendChild(card);
    
                        if (index >= 25) { // Delay loading of images after the first 25
                            card.querySelector('img').dataset.src = card.querySelector('img').src;
                            card.querySelector('img').src = '';
                        }
                    }
                });
            } else {
                responseContainer.innerText = 'No results found.';
            }
    
            // Handle loader visibility after first 25 images load
            handleImageLoad(25);
    
        } catch (error) {
            responseContainer.innerText = `Error: ${error.message}`;
        }
    }

    // Create Podcast Card
    function createCard(podcast) {
        const card = document.createElement('div');
        card.className = 'card pointer';
    
        const img = document.createElement('img');
        img.src = podcast.image || './default-podcast.png';
        img.alt = podcast.title;
    
        const content = document.createElement('div');
        content.className = 'card-content';
    
        // Header with title and Library star
        const header = document.createElement('div');
        header.className = 'card-header';

        const title = document.createElement('h3');
        title.innerText = podcast.title;

        header.appendChild(title);
        if (podcast.url) header.appendChild(createLibraryStar(podcast.url));
    
        const description = document.createElement('p');
        description.innerText = podcast.description;
    
        const episodeCount = document.createElement('p');
        episodeCount.className = 'episode-count';
        episodeCount.innerText = `Episodes: ${podcast.episodeCount}`;
    
        const pubDate = document.createElement('p');
        pubDate.className = 'pub-date';
        pubDate.innerText = `Newest Episode: ${podcast.newestItemPubdate ? formatDate(podcast.newestItemPubdate) : 'Not Available'}`;
    
        content.appendChild(header);
        content.appendChild(description);
        content.appendChild(episodeCount);
        content.appendChild(pubDate);
    
        card.appendChild(img);
        card.appendChild(content);
    
        card.addEventListener('click', () => loadEpisodes(podcast.itunesId, podcast.episodeCount));
    
        return card;
    }

    // Downloads ------------------------------------ //
    function downloadPercent(record) {
        return record.total ? Math.min(100, Math.floor((record.bytes / record.total) * 100)) : null;
    }

    // One control cycles through download -> pause -> resume -> delete
    function renderDownloadControl(control, record) {
        const icon = control.querySelector('i');
        const label = control.querySelector('span');
        const status = record ? record.status : 'none';
        const percent = record ? downloadPercent(record) : null;
        control.dataset.status = status;

        if (status === 'complete') {
            icon.className = 'fas fa-check-circle downloaded';
            control.title = 'Downloaded. Click to delete';
            label.textContent = '';
        } else if (status === 'downloading') {
            icon.className = 'fas fa-pause-circle';
            control.title = 'Pause download';
            label.textContent = percent !== null ? `${percent}%` : Downloads.formatBytes(record.bytes);
        } else if (status === 'paused' || status === 'error') {
            icon.className = 'fas fa-redo-alt';
            control.title = status === 'error' ? `${record.error}. Click to retry` : 'Resume download';
            label.textContent = status === 'error' ? 'Failed' : (percent !== null ? `${percent}%` : '');
        } else {
            icon.className = 'fas fa-download';
            control.title = 'Download for offline listening';
            label.textContent = '';
        }
    }

    function createDownloadControl(episode) {
        const id = Downloads.key(episode);
        const control = document.createElement('span');
        control.className = 'download-control';
        control.dataset.downloadId = id;
        control.append(document.createElement('i'), document.createElement('span'));
        renderDownloadControl(control, null);

        Downloads.get(id)
            .then(record => renderDownloadControl(control, record))
            .catch(error => console.error('Could not read download:', error));

        control.addEventListener('click', event => {
            event.stopPropagation();
            const status = control.dataset.status;
            if (status === 'downloading') {
                Downloads.pause(id);
            } else if (status === 'complete') {
                if (confirm(`Delete the download of "${episode.title}"?`)) {
                    Downloads.remove(id).catch(error => alert(`Could not delete: ${error.message}`));
                }
            } else {
                Downloads.start(episode).catch(error => alert(`Could not download: ${error.message}`));
            }
        });
        return control;
    }

    function fillDownloadStatus(card, record) {
        const percent = downloadPercent(record);
        const size = record.total
            ? `${Downloads.formatBytes(record.bytes)} of ${Downloads.formatBytes(record.total)}`
            : Downloads.formatBytes(record.bytes);
        const text = {
            complete: `Downloaded · ${Downloads.formatBytes(record.bytes)}`,
            downloading: `Downloading · ${size}`,
            paused: `Paused · ${size}`,
            error: `Failed: ${record.error} · ${size}`
        };
        card.querySelector('.download-status').textContent = text[record.status] || '';
        const bar = card.querySelector('.download-progress');
        bar.hidden = record.status === 'complete';
        bar.firstChild.style.width = `${percent || 0}%`;
    }

    function createDownloadCard(record) {
        const { episode } = record;
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.downloadCard = record.id;

        const img = document.createElement('img');
        img.src = episode.image || episode.feedImage || './default-podcast.png';
        img.alt = episode.title;

        const content = document.createElement('div');
        content.className = 'card-content';

        const title = document.createElement('h3');
        title.innerText = episode.title;

        const feed = document.createElement('p');
        feed.className = 'download-feed';
        feed.innerText = episode.feedTitle || '';

        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';

        const playBtnIcon = document.createElement('i');
        playBtnIcon.className = 'fas fa-play-circle mr-10';
        playBtnIcon.title = 'Play Podcast';
        playBtnIcon.addEventListener('click', () => loadPodcast(episode));

        const removeBtnIcon = document.createElement('i');
        removeBtnIcon.className = 'fas fa-trash-alt download-remove';
        removeBtnIcon.title = 'Delete Download';
        removeBtnIcon.addEventListener('click', () => {
            Downloads.remove(record.id).catch(error => alert(`Could not delete: ${error.message}`));
        });

        iconContainer.appendChild(playBtnIcon);
        iconContainer.appendChild(createDownloadControl(episode));
        iconContainer.appendChild(removeBtnIcon);

        const status = document.createElement('p');
        status.className = 'download-status';

        const bar = document.createElement('div');
        bar.className = 'download-progress';
        bar.appendChild(document.createElement('div'));

        content.appendChild(title);
        content.appendChild(feed);
        content.appendChild(iconContainer);
        content.appendChild(status);
        content.appendChild(bar);

        card.appendChild(img);
        card.appendChild(content);

        fillDownloadStatus(card, record);
        return card;
    }

    async function showDownloads() {
        responseContainer.dataset.view = 'downloads';
        let records;
        try {
            records = await Downloads.list();
        } catch (error) {
            responseContainer.innerText = `Downloads are unavailable in this browser: ${error.message}`;
            return;
        }
        // Another view was opened while the list was loading
        if (responseContainer.dataset.view !== 'downloads') return;

        responseContainer.textContent = '';
        loader.style.display = 'none';
        responseContainer.style.display = 'flex';

        if (records.length === 0) {
            responseContainer.innerText = 'No downloads yet. Open a podcast and click the download icon on an episode to listen offline.';
            return;
        }
        records.forEach(record => responseContainer.appendChild(createDownloadCard(record)));
        handleImageLoad(records.length);
    }

    downloadsButton.addEventListener('click', showDownloads);

    // Library (subscriptions) ---------------------- //
    const EPISODES_PER_PAGE = 50;

    function showView(view) {
        responseContainer.textContent = '';
        responseContainer.dataset.view = view;
        loader.style.display = 'none';
        responseContainer.style.display = 'flex';
        responseContainer.scrollTo({ top: 0 });
    }

    function makeButton(label, onClick, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (className) button.className = className;
        button.addEventListener('click', onClick);
        return button;
    }

    function setLibraryMessage(text, isError = false) {
        const message = responseContainer.querySelector('.library-message');
        if (!message) return;
        message.textContent = text;
        message.classList.toggle('error', isError);
    }

    // The star on search results adds the podcast's feed to the Library
    function createLibraryStar(feedUrl) {
        let url;
        try {
            url = Subscriptions.normalizeUrl(feedUrl);
        } catch (error) {
            return document.createTextNode('');
        }
        const icon = document.createElement('i');
        const render = subscribed => {
            icon.className = `${subscribed ? 'fas favorited' : 'far'} fa-star favorite-icon`;
            icon.title = subscribed ? 'Remove from Library' : 'Add to Library';
            icon.dataset.subscribed = subscribed ? 'true' : '';
        };
        render(false);
        Subscriptions.get(url).then(feed => render(Boolean(feed))).catch(() => {});

        icon.addEventListener('click', async event => {
            event.stopPropagation();
            if (icon.classList.contains('busy')) return;
            icon.classList.add('busy');
            try {
                if (icon.dataset.subscribed) {
                    await Subscriptions.unsubscribe(url);
                    render(false);
                } else {
                    await Subscriptions.subscribe(url);
                    render(true);
                }
            } catch (error) {
                alert(`Could not update your Library: ${error.message}`);
            } finally {
                icon.classList.remove('busy');
            }
        });
        return icon;
    }

    function createFeedCard(feed) {
        const card = document.createElement('div');
        card.className = 'card pointer';

        const img = document.createElement('img');
        img.src = feed.image || './default-podcast.png';
        img.alt = feed.title;

        const content = document.createElement('div');
        content.className = 'card-content';

        const header = document.createElement('div');
        header.className = 'card-header';

        const title = document.createElement('h3');
        title.innerText = feed.title;

        const removeIcon = document.createElement('i');
        removeIcon.className = 'fas fa-trash-alt favorite-icon';
        removeIcon.title = 'Unsubscribe';
        removeIcon.addEventListener('click', async event => {
            event.stopPropagation();
            if (!confirm(`Unsubscribe from "${feed.title}"?`)) return;
            try {
                await Subscriptions.unsubscribe(feed.url);
                card.remove();
                if (!responseContainer.querySelector('.library-feeds .card')) renderFeedList([]);
            } catch (error) {
                alert(`Could not unsubscribe: ${error.message}`);
            }
        });

        header.appendChild(title);
        header.appendChild(removeIcon);

        const author = document.createElement('p');
        author.innerText = feed.author || '';

        const episodeCount = document.createElement('p');
        episodeCount.className = 'episode-count';
        episodeCount.innerText = `Episodes: ${feed.episodeCount}`;

        const checked = document.createElement('p');
        checked.className = feed.error ? 'pub-date feed-error' : 'pub-date';
        checked.innerText = feed.error
            ? `Couldn't refresh: ${feed.error}`
            : `Updated: ${new Date(feed.lastChecked).toLocaleString()}`;

        content.appendChild(header);
        content.appendChild(author);
        content.appendChild(episodeCount);
        content.appendChild(checked);

        card.appendChild(img);
        card.appendChild(content);
        card.addEventListener('click', () => showFeedEpisodes(feed));
        return card;
    }

    function renderFeedList(feeds) {
        const list = responseContainer.querySelector('.library-feeds');
        if (!list) return;
        list.textContent = '';
        if (feeds.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'library-empty';
            empty.textContent = 'Your Library is empty. Search for a podcast and click its star, paste a feed URL above, or import an OPML file.';
            list.appendChild(empty);
            return;
        }
        feeds.forEach(feed => list.appendChild(createFeedCard(feed)));
    }

    async function reloadFeedList() {
        const feeds = await Subscriptions.list();
        if (responseContainer.dataset.view === 'library') renderFeedList(feeds);
        return feeds;
    }

    function createLibraryToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'library-toolbar';

        // Subscribe by URL
        const form = document.createElement('form');
        form.className = 'library-subscribe';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Paste a podcast RSS feed URL';
        input.setAttribute('aria-label', 'Podcast RSS feed URL');
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Subscribe';
        form.append(input, submit);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!input.value.trim()) return;
            submit.disabled = true;
            setLibraryMessage('Loading feed…');
            try {
                const { feed, added } = await Subscriptions.subscribe(input.value);
                setLibraryMessage(added ? `Subscribed to ${feed.title}.` : `You're already subscribed to ${feed.title}.`);
                input.value = '';
                await reloadFeedList();
            } catch (error) {
                setLibraryMessage(error.message, true);
            } finally {
                submit.disabled = false;
            }
        });

        // OPML import, export, and refresh
        const actions = document.createElement('div');
        actions.className = 'library-actions';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.opml,.xml,text/xml,application/xml,text/x-opml';
        fileInput.hidden = true;
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            setLibraryMessage('Importing…');
            try {
                const result = await Subscriptions.importOpml(await file.text(), (done, total) => {
                    setLibraryMessage(`Importing… ${done} of ${total}`);
                });
                const parts = [`Added ${result.added}`];
                if (result.existing) parts.push(`${result.existing} already subscribed`);
                if (result.failed.length) {
                    parts.push(`${result.failed.length} failed: ${result.failed.map(f => `${f.url} (${f.error})`).join('; ')}`);
                }
                setLibraryMessage(`${parts.join(', ')}.`, result.failed.length > 0);
                await reloadFeedList();
            } catch (error) {
                setLibraryMessage(error.message, true);
            }
        });

        const importButton = makeButton('Import OPML', () => fileInput.click());

        const exportButton = makeButton('Export OPML', async () => {
            try {
                const feeds = await Subscriptions.list();
                if (feeds.length === 0) {
                    setLibraryMessage('There are no subscriptions to export yet.', true);
                    return;
                }
                const blob = new Blob([await Subscriptions.exportOpml()], { type: 'text/x-opml' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'podcast-subscriptions.opml';
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            } catch (error) {
                setLibraryMessage(`Could not export: ${error.message}`, true);
            }
        });

        const refreshButton = makeButton('Refresh all', async () => {
            refreshButton.disabled = true;
            setLibraryMessage('Refreshing feeds…');
            try {
                const count = await Subscriptions.refreshStale(true);
                const feeds = await reloadFeedList();
                const failed = feeds.filter(feed => feed.error).length;
                setLibraryMessage(`Refreshed ${count} feed${count === 1 ? '' : 's'}${failed ? `, ${failed} with errors` : ''}.`, failed > 0);
            } catch (error) {
                setLibraryMessage(error.message, true);
            } finally {
                refreshButton.disabled = false;
            }
        });

        actions.append(importButton, exportButton, refreshButton, fileInput);

        const message = document.createElement('p');
        message.className = 'library-message';
        message.setAttribute('role', 'status');

        toolbar.append(form, actions, message);
        return toolbar;
    }

    async function showLibrary() {
        showView('library');
        responseContainer.appendChild(createLibraryToolbar());
        const list = document.createElement('div');
        list.className = 'library-feeds';
        responseContainer.appendChild(list);

        try {
            await reloadFeedList();
        } catch (error) {
            setLibraryMessage(`The library is unavailable in this browser: ${error.message}`, true);
            return;
        }

        // Pick up new episodes in the background for feeds not checked recently
        Subscriptions.refreshStale()
            .then(count => (count ? reloadFeedList() : null))
            .catch(error => console.error('Feed refresh failed:', error));
    }

    async function showFeedEpisodes(feed) {
        showView('feed');
        const header = document.createElement('div');
        header.className = 'library-toolbar';
        const back = makeButton('← Library', showLibrary);
        const title = document.createElement('h2');
        title.className = 'library-title';
        title.textContent = feed.title;
        header.append(back, title);
        responseContainer.appendChild(header);

        let items;
        try {
            items = await Subscriptions.episodes(feed.url);
        } catch (error) {
            responseContainer.appendChild(document.createTextNode(`Could not load episodes: ${error.message}`));
            return;
        }

        // Big feeds have hundreds of episodes, so show them a page at a time
        let shown = 0;
        const more = makeButton('Show more episodes', () => showPage(), 'library-more');
        const showPage = () => {
            if (responseContainer.dataset.view !== 'feed') return;
            items.slice(shown, shown + EPISODES_PER_PAGE).forEach(episode => {
                responseContainer.insertBefore(createEpisodeCard(episode), more);
            });
            shown += EPISODES_PER_PAGE;
            more.hidden = shown >= items.length;
        };
        responseContainer.appendChild(more);
        showPage();
    }

    libraryButton.addEventListener('click', showLibrary);

    // Keep every download control and the Downloads view up to date
    Downloads.subscribe((record, removed) => {
        const selector = CSS.escape(record.id);
        document.querySelectorAll(`[data-download-id="${selector}"]`).forEach(control => {
            renderDownloadControl(control, removed ? null : record);
        });

        if (responseContainer.dataset.view !== 'downloads') return;
        const card = responseContainer.querySelector(`[data-download-card="${selector}"]`);
        if (removed) {
            if (card) card.remove();
            if (!responseContainer.querySelector('[data-download-card]')) showDownloads();
        } else if (card) {
            fillDownloadStatus(card, record);
        } else {
            showDownloads();
        }
    });
    
    // Load Episodes
    async function loadEpisodes(feedId, count) {
        showLoader();
        responseContainer.dataset.view = 'episodes';

        try {
            const response = await fetch(`/api/episodes?feedId=${feedId}&max=${count}`);
            const data = await response.json();
    
            responseContainer.textContent = ''; // clear previous results
    
            if (data.items && data.items.length > 0) {
                data.items.forEach((episode, index) => {
                    const card = createEpisodeCard(episode);
                    responseContainer.appendChild(card);

                    if (index >= 25) { // Delay loading of images after the first 25
                        card.querySelector('img').dataset.src = card.querySelector('img').src;
                        card.querySelector('img').src = '';
                    }
                });
            } else {
                responseContainer.innerText = 'No episodes found.';
            }

            // Handle loader visibility after first 25 images load
            handleImageLoad(25);

        } catch (error) {
            responseContainer.innerText = `Error: ${error.message}`;
        }
    }

    // Create Episode Card
    function createEpisodeCard(episode) {
        const card = document.createElement('div');
        card.className = 'card';

        const img = document.createElement('img');
        img.src = episode.image || episode.feedImage || './default-podcast.png';
        img.alt = episode.title;

        const content = document.createElement('div');
        content.className = 'card-content';

        const title = document.createElement('h3');
        title.innerText = episode.title;

        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';

        const playBtnIcon = document.createElement('i');
        playBtnIcon.className = 'fas fa-play-circle mr-10';
        playBtnIcon.title = 'Play Podcast';
        playBtnIcon.addEventListener('click', () => {
            console.log('Episode played:', episode);
            loadPodcast(episode);
        });

        const queueBtnIcon = document.createElement('i');
        queueBtnIcon.className = 'fas fa-list';
        queueBtnIcon.title = 'Add to Queue';
        queueBtnIcon.addEventListener('click', () => {
            console.log('Episode queued:', episode);
            addToQueue(episode);
        });
    
        const description = document.createElement('p');
        description.append(sanitizeHtml(episode.description || 'No description available.'));

        const pubDate = document.createElement('p');
        pubDate.className = 'pub-date-alt';
        pubDate.innerText = `Published: ${episode.datePublished ? formatDate(episode.datePublished) : 'Not Available'}`;

        iconContainer.appendChild(playBtnIcon);
        iconContainer.appendChild(queueBtnIcon);
        iconContainer.appendChild(createDownloadControl(episode));
        iconContainer.appendChild(pubDate);

        content.appendChild(title);
        content.appendChild(iconContainer);
        content.appendChild(description);

        card.appendChild(img);
        card.appendChild(content);
    
        return card;
    }

    // Set Queue Array
    let queueItems = [];

    // Add item to queue
    function addToQueue(episode) {
        const card = document.createElement('div');
        card.className = 'queue-item';
    
        const img = document.createElement('img');
        img.src = episode.image || episode.feedImage || './default-podcast.png';
        img.alt = episode.title;
    
        const content = document.createElement('div');
        content.className = 'queue-content';
    
        const title = document.createElement('h3');
        title.innerText = episode.title;

        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';

        const playBtnIcon = document.createElement('i');
        playBtnIcon.className = 'fas fa-play-circle mb-10';
        playBtnIcon.title = 'Play Podcast';
        playBtnIcon.addEventListener('click', () => {
            console.log('Episode played:', episode);
            loadPodcast(episode);
        });

        const removeBtnIcon = document.createElement('i');
        removeBtnIcon.className = 'fas fa-trash-alt';
        removeBtnIcon.title = 'Remove from Queue';
        removeBtnIcon.addEventListener('click', () => {
            console.log('Episode deleted:', episode);
            deleteFromQueue(episode);
        });

        iconContainer.appendChild(playBtnIcon);
        iconContainer.appendChild(removeBtnIcon);
    
        content.appendChild(title);
        content.appendChild(iconContainer);
    
        card.appendChild(img);
        card.appendChild(content);
    
        queueContainer.appendChild(card);
        saveQueue(episode);
    }

    // Delete item from queue
    function deleteFromQueue(episode) {
        queueItems = queueItems.filter(item => item.title !== episode.title);
        localStorage.setItem('queue', JSON.stringify(queueItems));

        const queueElements = document.querySelectorAll('.queue-item');
        queueElements.forEach(item => {
            const title = item.querySelector('h3').innerText;
            if (title === episode.title) item.remove();
        });
    }

    // Save item to queue
    function saveQueue(episode) {
        queueItems.push(episode);
        localStorage.setItem('queue', JSON.stringify(queueItems));
    }

    // Load saved queue from local storage
    function loadQueue() {
        const savedQueue = JSON.parse(localStorage.getItem('queue'));
        if (savedQueue) {
            savedQueue.forEach(episode => addToQueue(episode));
        }
    }

    // Navigation ---------------------------------- //
    const searchLink = document.getElementById('searchLink');
    const listenLink = document.getElementById('listenLink');
    const searchContainer = document.querySelector('.search-container');
    const mainContainer = document.querySelector('.main-container');
    const playerContainer = document.querySelector('.player-container');

    searchLink.addEventListener('click', navigateToSearch);
    listenLink.addEventListener('click', navigateToPlayer);

    function navigateToSearch() {
        searchContainer.style.display = 'flex';
        mainContainer.style.display = 'flex';
        playerContainer.style.display = 'none';
        queueContainer.style.display = 'none';
        searchLink.classList.add('selected');
        listenLink.classList.remove('selected');
    }

    function navigateToPlayer() {
        searchContainer.style.display = 'none';
        mainContainer.style.display = 'none';
        playerContainer.style.display = 'flex';
        queueContainer.style.display = 'flex';
        searchLink.classList.remove('selected');
        listenLink.classList.add('selected');
    }

    // Player -------------------------------------------------- //
    const image = document.getElementById('image');
    const title = document.getElementById('title');
    const datePublished = document.getElementById('datePublished');
    const player = document.getElementById('player');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const progress = document.getElementById('progress');
    const progressContainer = document.getElementById('progress-container');
    const prevBtn = document.getElementById('prev');
    const playBtn = document.getElementById('play');
    const nextBtn = document.getElementById('next');

    // Check if Playing
    let isPlaying = false;
    let currentArtist = '';
    const hasMediaSession = 'mediaSession' in navigator;

    // Play
    function playPodcast() {
        player.play().catch(error => console.error('Playback failed:', error));
    }

    // Pause
    function pausePodcast() {
        player.pause();
    }

    // Keep the play button in step with the audio element, which can also be
    // paused from the lock screen, a headset, or another tab
    function setPlayingUI(playing) {
        isPlaying = playing;
        playBtn.classList.replace(playing ? 'fa-play' : 'fa-pause', playing ? 'fa-pause' : 'fa-play');
        playBtn.setAttribute('title', playing ? 'Pause' : 'Play');
        if (hasMediaSession) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        updatePositionState();
    }

    player.addEventListener('play', () => setPlayingUI(true));
    player.addEventListener('pause', () => setPlayingUI(false));

    // Play or Pause Event Listener
    playBtn.addEventListener('click', () => (isPlaying ? pausePodcast() : playPodcast()));

    // Plays the downloaded copy when there is one, otherwise streams.
    // Returns false if another episode was picked while this one was looked up
    let currentEpisode = null;
    let offlineUrl = null;
    let sourceRequest = 0;

    async function setEpisodeSource(episode) {
        const request = ++sourceRequest;
        let url = null;
        try {
            url = await Downloads.getPlaybackUrl(Downloads.key(episode));
        } catch (error) {
            console.error('Could not read downloaded episode:', error);
        }
        if (request !== sourceRequest) {
            if (url) URL.revokeObjectURL(url);
            return false;
        }
        if (offlineUrl) URL.revokeObjectURL(offlineUrl);
        offlineUrl = url;
        currentEpisode = episode;
        player.src = url || episode.enclosureUrl;
        return true;
    }

    // Update Podcast Container
    async function loadPodcast(episode) {
        currentTimeEl.style.display = 'none';
        durationEl.style.display = 'none';
        title.textContent = episode.title;
        datePublished.textContent = `${episode.datePublished ? formatDate(episode.datePublished) : 'Not Available'}`;
        image.src = episode.image || episode.feedImage || './default-podcast.png';
        currentArtist = episode.feedTitle || '';
        updateMediaMetadata(episode.title, currentArtist, image.src);
        progress.classList.add('loading');
        currentTimeEl.textContent = '0:00';

        if (!(await setEpisodeSource(episode))) return;

        // Reset Player
        player.currentTime = 0;
        playWhenLoaded = true;
    }

    // Registered once: adding it inside loadPodcast stacked a new listener
    // per episode, so each later load called play several times
    let playWhenLoaded = false;
    player.addEventListener('loadedmetadata', () => {
        if (!playWhenLoaded) return;
        playWhenLoaded = false;
        currentTimeEl.style.display = 'block';
        durationEl.style.display = 'block';
        formatTime(player.duration, durationEl);
        progress.classList.remove('loading');
        playPodcast();
    });

    // Format Time
    function formatTime(time, elName) {
        // Calculate hours, minutes, and seconds
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        let seconds = Math.floor(time % 60);

        // Format seconds
        if (seconds < 10) seconds = `0${seconds}`;

        // Format minutes
        const formattedMinutes = hours > 0 && minutes < 10 ? `0${minutes}` : minutes;

        // Display the time in hours:minutes:seconds or minutes:seconds
        if (time) {
            elName.textContent = hours > 0 
                ? `${hours}:${formattedMinutes}:${seconds}` 
                : `${minutes}:${seconds}`;
        }
    }

    // Skip forward or backward 15 seconds
    function skipTime(amount) {
        if (!Number.isFinite(player.duration)) return;
        player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + amount));
    }

    // Update Progress Bar & Time
    function updateProgressBar(e) {
        const { duration, currentTime } = e.srcElement;
        // Update progress bar width
        const progressPercent = (currentTime / duration) * 100;
        progress.style.width = `${progressPercent}%`;  
        // Format Time
        formatTime(duration, durationEl);
        formatTime(currentTime, currentTimeEl);
    }

    // Set Progress Bar
    function setProgressBar(e) {
        const width = this.clientWidth;
        const clickX = e.offsetX;
        const { duration } = player;
        player.currentTime = (clickX / width) * duration;
    }

    // Player Event Listeners
    player.addEventListener('timeupdate', updateProgressBar);
    progressContainer.addEventListener('click', setProgressBar);
    prevBtn.addEventListener('click', () => skipTime(-15));
    nextBtn.addEventListener('click', () => skipTime(15));

    // Media Session ------------------------------- //
    // Lock-screen, notification and hardware media key controls

    function updateMediaMetadata(episodeTitle, artist, artworkSrc) {
        if (!hasMediaSession) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: episodeTitle,
            artist: artist || 'Podcast Player',
            artwork: [{ src: new URL(artworkSrc || './default-podcast.png', location.href).href }]
        });
    }

    function updatePositionState() {
        if (!hasMediaSession || !navigator.mediaSession.setPositionState) return;
        const { duration, currentTime, playbackRate } = player;
        if (!Number.isFinite(duration) || duration <= 0) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate,
                position: Math.min(currentTime, duration)
            });
        } catch (error) {
            console.error('Could not update media position:', error);
        }
    }

    function setMediaAction(action, handler) {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
            // This browser doesn't support the action
        }
    }

    if (hasMediaSession) {
        setMediaAction('play', playPodcast);
        setMediaAction('pause', pausePodcast);
        setMediaAction('stop', pausePodcast);
        setMediaAction('seekbackward', details => skipTime(-(details.seekOffset || 15)));
        setMediaAction('seekforward', details => skipTime(details.seekOffset || 15));
        // Headsets and keyboard media keys usually send track changes, not seeks
        setMediaAction('previoustrack', () => skipTime(-15));
        setMediaAction('nexttrack', () => skipTime(15));
        setMediaAction('seekto', details => {
            if (details.fastSeek && 'fastSeek' in player) {
                player.fastSeek(details.seekTime);
            } else {
                player.currentTime = details.seekTime;
            }
            updatePositionState();
        });
    }

    ['loadedmetadata', 'seeked', 'ratechange'].forEach(event => {
        player.addEventListener(event, updatePositionState);
    });

    // Missing or broken artwork falls back to the default image, and the
    // lock screen follows whatever the player is actually showing
    image.addEventListener('error', () => {
        if (!image.src.endsWith('/default-podcast.png')) image.src = './default-podcast.png';
    });
    image.addEventListener('load', () => {
        if (hasMediaSession && navigator.mediaSession.metadata) {
            navigator.mediaSession.metadata.artwork = [{ src: image.src }];
        }
    });

    // Only one tab plays at a time: starting playback here pauses the others
    if ('BroadcastChannel' in window) {
        const playbackChannel = new BroadcastChannel('podcast-player-playback');
        player.addEventListener('play', () => playbackChannel.postMessage('playing'));
        playbackChannel.addEventListener('message', event => {
            if (event.data === 'playing') pausePodcast();
        });
    }

    // Save the player state to local storage every 5 seconds
    setInterval(() => {
        if (isPlaying) {
            const playerState = {
                title: title.textContent,
                datePublished: datePublished.textContent,
                currentTime: player.currentTime,
                duration: player.duration,
                image: image.src,
                // The real URL, not a downloaded copy's blob: URL, which dies on reload
                src: currentEpisode ? currentEpisode.enclosureUrl : player.src,
                episodeId: currentEpisode ? currentEpisode.id : undefined,
                artist: currentArtist
            };
            localStorage.setItem('playerState', JSON.stringify(playerState));
        }
    }, 5000);

    // Load saved player state from local storage
    async function loadPlayerState() {
        const savedState = JSON.parse(localStorage.getItem('playerState'));
        if (savedState) {
            title.textContent = savedState.title;
            datePublished.textContent = savedState.datePublished;
            image.src = savedState.image;
            currentArtist = savedState.artist || '';
            updateMediaMetadata(savedState.title, currentArtist, savedState.image);
            const episode = {
                id: savedState.episodeId,
                title: savedState.title,
                image: savedState.image,
                feedTitle: savedState.artist,
                enclosureUrl: savedState.src
            };
            if (!(await setEpisodeSource(episode))) return;
            player.currentTime = savedState.currentTime;
            formatTime(savedState.currentTime, currentTimeEl);
            player.duration = savedState.duration;
            formatTime(savedState.duration, durationEl);
            progress.style.width = `${(savedState.currentTime / savedState.duration) * 100}%`;
        }
    }

    // On Startup
    // The Library goes first, and each step is isolated, so bad saved data in
    // one can't stop the others from loading
    async function moveFavoritesIntoLibrary() {
        const moved = await migrateFavorites();
        if (moved && responseContainer.dataset.view === 'library') await reloadFeedList();
    }

    [showLibrary, moveFavoritesIntoLibrary, loadPlayerState, loadQueue, Downloads.markInterrupted].forEach(step => {
        Promise.resolve()
            .then(step)
            .catch(error => console.error(`Startup step ${step.name} failed:`, error));
    });

    // Service Worker ----------------------------- //
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
        });
    }
});

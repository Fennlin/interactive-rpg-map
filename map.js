// Map dimensions.
const mapWidth = 3840;
const mapHeight = 2160;

// App state.
let currentLanguage = localStorage.getItem('map-language') || 'en-us';
let activeLocationFileName = null;
let locationsLoadToken = 0;
let ignoreOutsideClickUntil = 0;
let locationPins = [];
let loreContentCache = {};

// Map setup.
const map = L.map('map', {
    crs: L.CRS.Simple,
    zoomControl: false,
    minZoom: -1,
    maxZoom: 2.5,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 175, // Higher values make zoom feel slower.
});

if (map.zoomControl) {
    map.removeControl(map.zoomControl);
}

const bounds = [[0, 0], [mapHeight, mapWidth]];
L.imageOverlay('Iari-sios.png', bounds).addTo(map);
map.fitBounds(bounds);
map.setMaxBounds(bounds);
map.invalidateSize();

// Custom pin icons.
const rpgIcons = {
    capital_city: createRpgIcon('icons/pin_capital_city.png', 60),
    big_city: createRpgIcon('icons/pin_big_city.png', 55),
    small_city: createRpgIcon('icons/pin_small_city.png', 50),
    outpost: createRpgIcon('icons/pin_outpost.png', 45),
    water: createRpgIcon('icons/pin_water.png', 45),
    forest: createRpgIcon('icons/pin_forest.png', 45),
    mountain: createRpgIcon('icons/pin_mountain.png', 45),
    default: createRpgIcon('icons/pin_default.png', 45),
};

// Builds a pin icon with the bottom edge anchored to the map point.
function createRpgIcon(url, size) {
    const anchorX = size / 2;
    const anchorY = size;

    return L.icon({
        iconUrl: url,
        iconSize: [size, size],
        iconAnchor: [anchorX, anchorY],
        popupAnchor: [0, -size],
    });
}

// Maps icon type aliases to the layer group that should receive the marker.
function getLayerTypeForPin(iconType) {
    if (iconType === 'capital_city' || iconType === 'big_city' || iconType === 'small_city') {
        return 'city';
    }

    if (iconType === 'water') {
        return 'sea';
    }

    if (iconType === 'forest') {
        return 'forest';
    }

    if (iconType === 'mountain') {
        return 'mountain';
    }

    return iconType;
}

// Translations used by the interface.
const languageLabels = {
    'en-us': {
        filtersTitle: 'Filters',
        filterCity: '🏙️ Cities and Towns',
        filterPlains: '🌾 Plains',
        filterForest: '🌲 Forests',
        filterSea: '🌊 Seas and Oceans',
        filterOutpost: '🛡️ Outposts',
        filterMountain: '🏔️ Mountains',
        locationName: 'Location Name',
        locationType: 'Location Type',
        loreLoading: 'Lore loading...',
        loreButton: 'Lore',
        loreClose: 'Close lore popup',
        loreCouldNotLoad: 'Could not load lore content.',
        readingLore: '<em>Reading ancient scrolls...</em>',
        history: 'History',
        pointsOfInterest: 'Points of Interest',
        credits: 'Credits',
        noDescription: 'No description available.',
        couldNotLoad: 'Could not load location data.',
    },
    'pt-br': {
        filtersTitle: 'Filtros',
        filterCity: '🏙️ Cidades e Povoados',
        filterPlains: '🌾 Planícies',
        filterForest: '🌲 Florestas',
        filterSea: '🌊 Mares e Oceanos',
        filterOutpost: '🛡️ Postos Avançados',
        filterMountain: '🏔️ Montanhas',
        locationName: 'Nome do Local',
        locationType: 'Tipo do Local',
        loreLoading: 'Carregando história...',
        loreButton: 'Lore',
        loreClose: 'Fechar popup de lore',
        loreCouldNotLoad: 'Não foi possível carregar o lore.',
        readingLore: '<em>Lendo pergaminhos antigos...</em>',
        history: 'História',
        pointsOfInterest: 'Pontos de Interesse',
        credits: 'Créditos',
        noDescription: 'Nenhuma descrição disponível.',
        couldNotLoad: 'Não foi possível carregar os dados do local.',
    },
};

// Returns the preferred language list to try while loading files.
function getLanguageCandidates(languageCode) {
    const normalizedLanguage = (languageCode || 'en-us').toLowerCase();
    const candidates = [normalizedLanguage];

    if (normalizedLanguage !== 'en-us') {
        candidates.push('en-us');
    }

    return candidates;
}

// Tries each path until one JSON file loads successfully.
async function fetchJsonWithFallback(relativePaths) {
    for (const relativePath of relativePaths) {
        try {
            const response = await fetch(relativePath);

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            // TODO: Try the next fallback path?
        }
    }

    throw new Error(`Could not load any of the fallback paths: ${relativePaths.join(', ')}`);
}

// Loads the manifest file for the selected language.
async function loadManifestForLanguage(languageCode) {
    const candidates = getLanguageCandidates(languageCode).map(folder => `locations/${folder}/_MANIFEST.JSON`);

    return fetchJsonWithFallback(candidates);
}

// Loads a location file for the selected language.
async function loadLocationForLanguage(languageCode, fileName) {
    const candidates = getLanguageCandidates(languageCode).map(folder => `locations/${folder}/${fileName}`);

    return fetchJsonWithFallback(candidates);
}

// Loads the lore file for the selected language.
async function loadLoreForLanguage(languageCode) {
    const manifest = await loadManifestForLanguage(languageCode);
    const loreFileName = manifest.lore || '_LORE.json';
    const candidates = getLanguageCandidates(languageCode).map(folder => `locations/${folder}/${loreFileName}`);

    return fetchJsonWithFallback(candidates);
}

// Renders the lore popup content.
function renderLorePopup(loreData) {
    const labels = languageLabels[currentLanguage] || languageLabels['en-us'];
    const loreModalContent = document.getElementById('lore-modal-content');

    document.getElementById('lore-modal-eyebrow').innerText = loreData.eyebrow || '';
    document.getElementById('lore-modal-title').innerText = loreData.title || '';

    const entries = Array.isArray(loreData.entries) ? loreData.entries : [];

    if (!entries.length) {
        loreModalContent.innerHTML = `<p>${labels.loreCouldNotLoad}</p>`;
        return;
    }

    loreModalContent.innerHTML = entries.map(entry => `
        <article>
            <h3>${entry.title || ''}</h3>
            <p>${entry.body || ''}</p>
        </article>
    `).join('');
}

// Refreshes the lore popup when the language changes or the panel opens.
async function refreshLorePopup() {
    const modal = document.getElementById('lore-modal');

    if (!modal.classList.contains('open')) {
        return;
    }

    const labels = languageLabels[currentLanguage] || languageLabels['en-us'];
    const loreModalContent = document.getElementById('lore-modal-content');

    loreModalContent.innerHTML = `<p>${labels.loreLoading}</p>`;

    try {
        const cacheKey = currentLanguage;

        if (!loreContentCache[cacheKey]) {
            loreContentCache[cacheKey] = await loadLoreForLanguage(currentLanguage);
        }

        renderLorePopup(loreContentCache[cacheKey]);
    } catch (error) {
        console.error(error);
        loreModalContent.innerHTML = `<p>${labels.loreCouldNotLoad}</p>`;
    }
}

// Applies the interface text for the selected language.
function applyInterfaceLanguage(languageCode) {
    const labels = languageLabels[languageCode] || languageLabels['en-us'];
    const rightSidebar = document.getElementById('right-sidebar');
    const rightSidebarIsOpen = rightSidebar.classList.contains('open');
    const loreModalContent = document.getElementById('lore-modal-content');

    document.documentElement.lang = languageCode.startsWith('pt') ? 'pt-BR' : 'en';
    document.getElementById('filters-title').innerText = labels.filtersTitle;
    document.querySelector('[data-i18n="filter-city"]').innerText = labels.filterCity;
    document.querySelector('[data-i18n="filter-plains"]').innerText = labels.filterPlains;
    document.querySelector('[data-i18n="filter-forest"]').innerText = labels.filterForest;
    document.querySelector('[data-i18n="filter-sea"]').innerText = labels.filterSea;
    document.querySelector('[data-i18n="filter-outpost"]').innerText = labels.filterOutpost;
    document.querySelector('[data-i18n="filter-mountain"]').innerText = labels.filterMountain;
    document.getElementById('lore-toggle').innerText = labels.loreButton;
    document.getElementById('lore-close').setAttribute('aria-label', labels.loreClose);

    if (!rightSidebarIsOpen) {
        document.getElementById('sidebar-title').innerText = labels.locationName;
        document.getElementById('sidebar-type').innerText = labels.locationType;
        document.getElementById('sidebar-content').innerHTML = labels.loreLoading;
    }

    refreshLorePopup();

    document.querySelectorAll('.language-button').forEach(button => {
        button.classList.toggle('active', button.dataset.lang === languageCode);
    });
}

// Changes the UI language and reloads the locations.
function setLanguage(languageCode) {
    currentLanguage = languageCode;
    localStorage.setItem('map-language', languageCode);
    applyInterfaceLanguage(languageCode);
    loadLocations({ preserveOpenLocation: false });
}

// Closes both sidebars.
function closeAllSidebars() {
    document.getElementById('right-sidebar').classList.remove('open');
    document.getElementById('left-sidebar').classList.remove('open');
    closeLorePopup();
}

// Prevents an immediate outside click from closing a sidebar.
function suppressOutsideClickBriefly() {
    ignoreOutsideClickUntil = Date.now() + 150;
}

// Loads the selected location details into the right sidebar.
function loadLocationLore(pin) {
    const labels = languageLabels[currentLanguage] || languageLabels['en-us'];
    const rightSidebar = document.getElementById('right-sidebar');
    const leftSidebar = document.getElementById('left-sidebar');

    activeLocationFileName = pin.__sourceFile || null;
    leftSidebar.classList.remove('open');

    document.getElementById('sidebar-title').innerText = pin.name;
    document.getElementById('sidebar-type').innerText = pin.type;
    document.getElementById('sidebar-content').innerHTML = labels.readingLore;

    rightSidebar.classList.add('open');

    let htmlContent = `<p>${pin.description || labels.noDescription}</p>`;

    if (pin.history) {
        htmlContent += `<h3>${labels.history}</h3><p>${pin.history}</p>`;
    }

    if (pin.points_of_interest && pin.points_of_interest.length) {
        htmlContent += `<h3>${labels.pointsOfInterest}</h3><ul>`;
        pin.points_of_interest.forEach(poi => {
            htmlContent += `<li>${poi}</li>`;
        });
        htmlContent += `</ul>`;
    }

    if (pin.credits) {
        htmlContent += `<h3>${labels.credits}</h3><p><em>${pin.credits}</em></p>`;
    }

    document.getElementById('sidebar-content').innerHTML = htmlContent;
}

// Shows the location name above a pin.
function loadLocationName(pin) {
    if (!pin.marker.getTooltip()) {
        const iconSize = pin.marker.options.icon?.options?.iconSize?.[1] || 0;
        const tooltipOffsetY = -(iconSize + 3);

        pin.marker.bindTooltip(pin.name, {
            direction: 'top',
            offset: [0, tooltipOffsetY],
            opacity: 1,
            className: 'name-label',
        });
    }

    pin.marker.openTooltip();
}

// Layer groups used to toggle pin categories.
const layers = {
    city: L.layerGroup().addTo(map),
    plains: L.layerGroup().addTo(map),
    forest: L.layerGroup().addTo(map),
    sea: L.layerGroup().addTo(map),
    mountain: L.layerGroup().addTo(map),
    outpost: L.layerGroup().addTo(map),
};

// Loads every location file and rebuilds the pins.
async function loadLocations(options = {}) {
    try {
        const preserveOpenLocation = options.preserveOpenLocation !== false;
        const loadToken = ++locationsLoadToken;
        const manifest = await loadManifestForLanguage(currentLanguage);
        const locationFiles = Array.isArray(manifest.files) ? manifest.files : [];

        Object.values(layers).forEach(layerGroup => {
            layerGroup.clearLayers();
        });

        locationPins.length = 0;

        const loadedLocationPins = await Promise.all(
            locationFiles.map(async fileName => {
                const pin = await loadLocationForLanguage(currentLanguage, fileName);
                pin.__sourceFile = fileName;
                return pin;
            })
        );

        loadedLocationPins.forEach(pin => {
            const chosenIcon = rpgIcons[pin.iconType] || rpgIcons.default;
            const marker = L.marker(pin.coords, { icon: chosenIcon });

            pin.marker = marker;
            locationPins.push(pin);

            marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e.originalEvent);
                loadLocationLore(pin);
            });

            marker.on('mouseover', function() {
                loadLocationName(pin);
            });

            marker.on('mouseout', function() {
                marker.closeTooltip();
            });

            const layerType = getLayerTypeForPin(pin.iconType);

            if (layers[layerType]) {
                layers[layerType].addLayer(marker);
            } else {
                layers.city.addLayer(marker);
            }
        });

        if (loadToken !== locationsLoadToken) {
            return;
        }

        if (preserveOpenLocation && activeLocationFileName) {
            const reopenedPin = locationPins.find(pin => pin.__sourceFile === activeLocationFileName);

            if (reopenedPin) {
                loadLocationLore(reopenedPin);
            }
        }
    } catch (err) {
        console.error(err);
        document.getElementById('sidebar-content').innerHTML = `<p>${(languageLabels[currentLanguage] || languageLabels['en-us']).couldNotLoad}</p>`;
    }
}

// Closes the right sidebar.
function closeRightSidebar() {
    document.getElementById('right-sidebar').classList.remove('open');
}

// Toggles the left sidebar.
function toggleLeftSidebar() {
    const leftSidebar = document.getElementById('left-sidebar');

    if (!leftSidebar.classList.contains('open')) {
        document.getElementById('right-sidebar').classList.remove('open');
    }

    leftSidebar.classList.toggle('open');
}

// Opens the lore popup.
async function openLorePopup() {
    const modal = document.getElementById('lore-modal');

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lore-open');

    await refreshLorePopup();
}

// Closes the lore popup.
function closeLorePopup() {
    document.getElementById('lore-modal').classList.remove('open');
    document.getElementById('lore-modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lore-open');
}

// Toggles a marker layer on or off.
function toggleLayer(type) {
    const checkbox = document.getElementById(`chk-${type}`);
    const layer = layers[type];

    if (!checkbox || !layer) {
        return;
    }

    if (checkbox.checked) {
        map.addLayer(layer);
    } else {
        map.removeLayer(layer);
    }
}

// Applies the initial interface language and loads the map data.
applyInterfaceLanguage(currentLanguage);
loadLocations();

// Keeps the sidebars open while the map is being dragged (thanks Czar for the awesome feedback!).
map.on('dragstart', function() {
    suppressOutsideClickBriefly();
});

map.on('dragend', function() {
    suppressOutsideClickBriefly();
});

// Closes the sidebars when clicking outside of them.
document.addEventListener('click', function(event) {
    if (Date.now() < ignoreOutsideClickUntil) {
        return;
    }

    const rightSidebar = document.getElementById('right-sidebar');
    const leftSidebar = document.getElementById('left-sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const loreToggle = document.getElementById('lore-toggle');
    const loreDialog = document.querySelector('.lore-modal__dialog');
    const closeButton = document.getElementById('close-btn');
    const closeLeftButton = document.getElementById('close-left-btn');

    const clickedInsideSidebar = rightSidebar.contains(event.target) || leftSidebar.contains(event.target);
    const clickedInsideLoreDialog = loreDialog.contains(event.target);
    const clickedToggleControl = event.target === menuToggle || event.target === loreToggle || event.target === closeButton || event.target === closeLeftButton;

    if (clickedInsideSidebar || clickedInsideLoreDialog || clickedToggleControl) {
        return;
    }

    closeAllSidebars();
});

// Closes the sidebars when Escape is pressed.
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllSidebars();
    }
});



// DEV TOOL: show map coordinates in the console.
map.on('click', function(e) {
    const y = Math.round(e.latlng.lat);
    const x = Math.round(e.latlng.lng);

    console.log(`New Pin Coords: [${y}, ${x}]`);
});
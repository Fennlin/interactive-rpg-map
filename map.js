// map dimensions
const mapWidth = 3840;
const mapHeight = 2160;

const map = L.map('map', {
    crs: L.CRS.Simple,
    zoomControl: false,
    
    // limitations
    minZoom: -1,
    maxZoom: 2.5,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 175, // higher = slower, "smoother zoom"
});

if (map.zoomControl) {
    map.removeControl(map.zoomControl);
}

const bounds = [[0, 0], [mapHeight, mapWidth]];
L.imageOverlay('Iari-sios.png', bounds).addTo(map);
map.fitBounds(bounds);
map.setMaxBounds(bounds);
map.invalidateSize();

// Dictionary of pins using custom icons
const rpgIcons = {
    capital: createRpgIcon('icons/pin_capital_city.png', 60),
    bcity: createRpgIcon('icons/pin_big_city.png', 55),
    scity: createRpgIcon('icons/pin_small_city.png', 50),
    outpost: createRpgIcon('icons/pin_outpost.png', 45),
    default: createRpgIcon('icons/pin_default.png', 45) //fallback icon for any location type that doesn't have a specific icon defined
};

// Returns icons adjusted for screen
function createRpgIcon(url, size) {
    const anchorX = size / 2;
    const anchorY = size;

    return L.icon({
        iconUrl: url,
        iconSize: [size, size],
        iconAnchor: [anchorX, anchorY], // To anchor exactly at the center of the bottom part of the icons
        popupAnchor: [0, -size] // Dynamically adjusted to the top of the icon
    });
}

function closeAllSidebars() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('left-sidebar').classList.remove('open');
}

// Right sidebar that loads the selected location's info
function loadLocationLore(pin) {
    const sidebar = document.getElementById('sidebar');
    const leftSidebar = document.getElementById('left-sidebar');

    leftSidebar.classList.remove('open');
    
    // Headers
    document.getElementById('sidebar-title').innerText = pin.name;
    document.getElementById('sidebar-type').innerText = pin.type;
    document.getElementById('sidebar-content').innerHTML = "<em>Reading ancient scrolls...</em>";
    
    // Layout
    sidebar.classList.add('open');

    // Formats the info that already came from the location file
    let htmlContent = `<p>${pin.description || 'No description available.'}</p>`;

    if (pin.history) {
        htmlContent += `<h3>History</h3><p>${pin.history}</p>`;
    }

    if (pin.points_of_interest && pin.points_of_interest.length) {
        htmlContent += `<h3>Points of Interest</h3><ul>`;
        pin.points_of_interest.forEach(poi => {
            htmlContent += `<li>${poi}</li>`;
        });
        htmlContent += `</ul>`;
    }

    document.getElementById('sidebar-content').innerHTML = htmlContent;
}

function loadLocationName(pin) {
    if (!pin.marker.getTooltip()) {
        const iconSize = pin.marker.options.icon?.options?.iconSize?.[1] || 0;
        const tooltipOffsetY = -(iconSize + 3);

        pin.marker.bindTooltip(pin.name, {
            direction: 'top',
            offset: [0, tooltipOffsetY],
            opacity: 1,
            className: 'name-label'
        });
    }

    pin.marker.openTooltip();
}

// creating layers for different location types, so they can be toggled on/off
const layers = {
    city: L.layerGroup().addTo(map), // capitals, big and small cities
    plains: L.layerGroup().addTo(map), // plains
    forest: L.layerGroup().addTo(map), // forests
    sea: L.layerGroup().addTo(map), // seas and oceans
    mountain: L.layerGroup().addTo(map), // mountains
    outpost: L.layerGroup().addTo(map) // outposts
};

async function loadLocations() {
    try {
        const manifestResponse = await fetch('locations/_MANIFEST.JSON');

        if (!manifestResponse.ok) {
            throw new Error('Location manifest not found');
        }

        const manifest = await manifestResponse.json();
        const locationFiles = Array.isArray(manifest.files) ? manifest.files : [];

        const locationPins = await Promise.all(
            locationFiles.map(async fileName => {
                const response = await fetch(`locations/${fileName}`);

                if (!response.ok) {
                    throw new Error(`Could not load ${fileName}`);
                }

                return response.json();
            })
        );

        locationPins.forEach(pin => {
            const chosenIcon = rpgIcons[pin.iconType] || rpgIcons['default'];
            const marker = L.marker(pin.coords, { icon: chosenIcon });
            pin.marker = marker;

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

            if (pin.iconType === 'capital' || pin.iconType === 'bcity' || pin.iconType === 'scity') {
                layers['city'].addLayer(marker);
            } else if (layers[pin.iconType]) {
                layers[pin.iconType].addLayer(marker);
            } else {
                layers['city'].addLayer(marker);
            }
        });
    } catch (err) {
        console.error(err);
        document.getElementById('sidebar-content').innerHTML = '<p>Could not load location data.</p>';
    }
}

loadLocations();

// Control for the right sidebar (lore)
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
}

// Opens/Closes the left sidebar (layers and filters)
function toggleLeftSidebar() {
    const leftSidebar = document.getElementById('left-sidebar');

    if (!leftSidebar.classList.contains('open')) {
        document.getElementById('sidebar').classList.remove('open');
    }

    leftSidebar.classList.toggle('open');
}

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

document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const leftSidebar = document.getElementById('left-sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const closeButton = document.getElementById('close-btn');
    const closeLeftButton = document.getElementById('close-left-btn');

    const clickedInsideSidebar = sidebar.contains(event.target) || leftSidebar.contains(event.target);
    const clickedToggleControl = event.target === menuToggle || event.target === closeButton || event.target === closeLeftButton;

    if (clickedInsideSidebar || clickedToggleControl) {
        return;
    }

    closeAllSidebars();
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllSidebars();
    }
});


// ==========================================
// DEV TOOL: find map coords
// ==========================================
// Clicking on the map while the project is running will show the coordinates of where you clicked in the Console
map.on('click', function(e) {
    const y = Math.round(e.latlng.lat);
    const x = Math.round(e.latlng.lng);
    
    console.log(`New Pin Coords: [${y}, ${x}]`);
});
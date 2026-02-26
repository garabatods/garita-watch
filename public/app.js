const API_URL = '/api/bwt';
let allPorts = [];
let filteredPorts = [];
let favorites = JSON.parse(localStorage.getItem('bwtFavorites')) || [];
let currentFilter = 'all'; // 'all' or 'fav'
let currentStatus = 'open'; // 'all', 'open', 'closed'
let currentSort = 'alpha'; // 'alpha', 'shortest', 'longest', 'nearest'
let userLocation = null; // {lat, lng}
let nextRefreshTime = 0;
let refreshInterval, countdownInterval;

// Static port data: region + coordinates for all Mexican border ports
// Region keys: ca-bc, az-son, nm-chih, tx-chih, tx-tamps
const PORT_DATA = {
    // California – Baja California
    '250201': { region: 'ca-bc', lat: 32.7194, lng: -114.6997 }, // Andrade
    '250301': { region: 'ca-bc', lat: 32.6781, lng: -115.4988 }, // Calexico East
    '250302': { region: 'ca-bc', lat: 32.6743, lng: -115.4992 }, // Calexico West
    '250101': { region: 'ca-bc', lat: 32.5421, lng: -117.0293 }, // Otay Mesa
    '250102': { region: 'ca-bc', lat: 32.5368, lng: -117.0283 }, // Otay Mesa East
    '250103': { region: 'ca-bc', lat: 32.5367, lng: -117.0272 }, // Otay Mesa Cargo
    '250104': { region: 'ca-bc', lat: 32.5413, lng: -116.9769 }, // Cross Border Express
    '250401': { region: 'ca-bc', lat: 32.5493, lng: -116.6289 }, // Tecate
    '250501': { region: 'ca-bc', lat: 32.5412, lng: -117.0322 }, // San Ysidro
    '250502': { region: 'ca-bc', lat: 32.5425, lng: -117.0346 }, // San Ysidro PedWest
    '250503': { region: 'ca-bc', lat: 32.5412, lng: -117.0322 }, // San Ysidro CBX
    // Arizona – Sonora
    '260101': { region: 'az-son', lat: 31.3338, lng: -109.5454 }, // Douglas
    '260201': { region: 'az-son', lat: 31.9505, lng: -112.8061 }, // Lukeville
    '260302': { region: 'az-son', lat: 31.3361, lng: -109.9480 }, // Naco
    '260401': { region: 'az-son', lat: 31.3405, lng: -110.9372 }, // Nogales DeConcini
    '260402': { region: 'az-son', lat: 31.3398, lng: -110.9357 }, // Nogales Mariposa
    '260403': { region: 'az-son', lat: 31.3396, lng: -110.9362 }, // Nogales Morley Gate
    '260501': { region: 'az-son', lat: 31.4828, lng: -111.5476 }, // Sasabe
    '260601': { region: 'az-son', lat: 32.4870, lng: -114.7826 }, // San Luis
    '260602': { region: 'az-son', lat: 32.4859, lng: -114.7731 }, // San Luis II
    // New Mexico – Chihuahua
    '240601': { region: 'nm-chih', lat: 31.8270, lng: -107.6356 }, // Columbus
    '240501': { region: 'nm-chih', lat: 31.7875, lng: -106.6552 }, // Santa Teresa
    // Texas – Chihuahua (El Paso area)
    '240215': { region: 'tx-chih', lat: 31.7586, lng: -106.4540 }, // BOTA Cargo
    '240207': { region: 'tx-chih', lat: 31.7586, lng: -106.4540 }, // Bridge of the Americas
    '240201': { region: 'tx-chih', lat: 31.7586, lng: -106.4540 }, // Bridge of Americas Alt
    '240204': { region: 'tx-chih', lat: 31.7599, lng: -106.4484 }, // Paso Del Norte
    '240208': { region: 'tx-chih', lat: 31.7671, lng: -106.4275 }, // Stanton DCL
    '240206': { region: 'tx-chih', lat: 31.7671, lng: -106.4275 }, // Stanton
    '240205': { region: 'tx-chih', lat: 31.6939, lng: -106.3013 }, // Ysleta
    '240210': { region: 'tx-chih', lat: 31.6939, lng: -106.3013 }, // Ysleta Cargo
    '240212': { region: 'tx-chih', lat: 31.4255, lng: -105.8541 }, // Tornillo
    '240301': { region: 'tx-chih', lat: 31.1390, lng: -105.0044 }, // Fort Hancock
    '240401': { region: 'tx-chih', lat: 31.0952, lng: -105.0065 }, // Fabens
    '230301': { region: 'tx-chih', lat: 29.5602, lng: -104.3681 }, // Presidio
    // Texas – Tamaulipas/Coahuila
    '535501': { region: 'tx-tamps', lat: 25.9017, lng: -97.4975 }, // Brownsville B&M
    '535504': { region: 'tx-tamps', lat: 25.9010, lng: -97.5034 }, // Brownsville Gateway
    '535503': { region: 'tx-tamps', lat: 26.0476, lng: -97.6619 }, // Brownsville Los Indios
    '535502': { region: 'tx-tamps', lat: 25.9773, lng: -97.5594 }, // Brownsville Veterans
    '230201': { region: 'tx-tamps', lat: 29.3759, lng: -100.8975 }, // Del Rio
    '230101': { region: 'tx-tamps', lat: 28.7091, lng: -100.4995 }, // Eagle Pass
    '230102': { region: 'tx-tamps', lat: 28.7029, lng: -100.4891 }, // Eagle Pass II
    '580401': { region: 'tx-tamps', lat: 26.1004, lng: -98.2383 }, // Hidalgo/Pharr
    '580402': { region: 'tx-tamps', lat: 26.0875, lng: -98.2602 }, // Anzalduas
    '580101': { region: 'tx-tamps', lat: 27.5006, lng: -99.5069 }, // Laredo Columbia
    '580102': { region: 'tx-tamps', lat: 27.5016, lng: -99.5076 }, // Laredo Solidarity
    '580103': { region: 'tx-tamps', lat: 27.5025, lng: -99.4901 }, // Laredo Lincoln/Juarez
    '580104': { region: 'tx-tamps', lat: 27.5009, lng: -99.4965 }, // Laredo WTC
    '580201': { region: 'tx-tamps', lat: 26.1948, lng: -97.6962 }, // Progreso
    '580301': { region: 'tx-tamps', lat: 26.3809, lng: -98.8215 }, // Rio Grande City
    '580302': { region: 'tx-tamps', lat: 26.4050, lng: -99.0162 }, // Roma
};

const REGION_ORDER = ['ca-bc', 'az-son', 'nm-chih', 'tx-chih', 'tx-tamps'];

// DOM Elements
const grid = document.getElementById('ports-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
searchInput.placeholder = 'Search ports...';
const tabAll = document.getElementById('tab-all');
const tabFav = document.getElementById('tab-fav');
const lastUpdatedEl = document.getElementById('last-updated');
const refreshCountdownEl = document.getElementById('refresh-countdown');
const sortSelect = document.getElementById('sort-select');
const filterBtns = document.querySelectorAll('.filter-btn');

// Initialize
async function init() {
    if (favorites.length > 0) {
        currentFilter = 'fav';
        tabFav.classList.add('active');
        tabAll.classList.remove('active');
    }
    setupEventListeners();
    requestUserLocation();
    await fetchData();
    startCountdown();
}

function setupEventListeners() {
    searchInput.addEventListener('input', () => {
        render();
    });

    tabAll.addEventListener('click', () => {
        currentFilter = 'all';
        tabAll.classList.add('active');
        tabFav.classList.remove('active');
        render();
    });

    tabFav.addEventListener('click', () => {
        currentFilter = 'fav';
        tabFav.classList.add('active');
        tabAll.classList.remove('active');
        render();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentStatus = btn.dataset.status;
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            render();
        });
    });

    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        if (currentSort === 'nearest' && !userLocation) {
            requestUserLocation();
        }
        render();
    });
}

function startCountdown() {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);

    // Refresh every 5 minutes
    const refreshDelay = 5 * 60 * 1000;
    nextRefreshTime = Date.now() + refreshDelay;

    countdownInterval = setInterval(() => {
        const remaining = Math.max(0, nextRefreshTime - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        refreshCountdownEl.textContent = `Next refresh in ${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);

    refreshInterval = setInterval(async () => {
        await fetchData();
        nextRefreshTime = Date.now() + refreshDelay;
    }, refreshDelay);
}

async function fetchData() {
    try {
        loading.classList.remove('hidden');
        if (allPorts.length === 0) grid.classList.add('hidden');
        noResults.classList.add('hidden');

        const response = await fetch(API_URL);
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        parseXML(xmlDoc);
        render();
    } catch (error) {
        console.error("Error fetching data:", error);
        loading.classList.add('hidden');
        if (allPorts.length === 0) {
            noResults.classList.remove('hidden');
            noResults.innerHTML = `<h3>Error loading data</h3><p>Please try again later. Make sure the proxy server is running.</p>`;
        }
    }
}

function parseXML(xmlDoc) {
    const portNodes = xmlDoc.getElementsByTagName('port');
    const updateDate = xmlDoc.getElementsByTagName('last_updated_date')[0]?.textContent;
    const updateTime = xmlDoc.getElementsByTagName('last_updated_time')[0]?.textContent;

    if (updateDate && updateTime) {
        lastUpdatedEl.textContent = `Updated: ${formatDateTime(updateDate, updateTime)}`;
    }

    const newPorts = [];

    for (let i = 0; i < portNodes.length; i++) {
        const port = portNodes[i];
        const border = port.getElementsByTagName('border')[0]?.textContent;

        // Only include Mexican Border
        if (border !== 'Mexican Border') continue;

        const portNum = port.getElementsByTagName('port_number')[0]?.textContent;
        const portMeta = PORT_DATA[portNum] || {};
        const p = {
            port_number: portNum,
            port_name: port.getElementsByTagName('port_name')[0]?.textContent,
            crossing_name: port.getElementsByTagName('crossing_name')[0]?.textContent,
            hours: port.getElementsByTagName('hours')[0]?.textContent,
            port_status: port.getElementsByTagName('port_status')[0]?.textContent,
            passenger: parseLanes(port.getElementsByTagName('passenger_vehicle_lanes')[0]),
            commercial: parseLanes(port.getElementsByTagName('commercial_vehicle_lanes')[0]),
            pedestrian: parseLanes(port.getElementsByTagName('pedestrian_lanes')[0]),
            region: portMeta.region || 'unknown',
            lat: portMeta.lat,
            lng: portMeta.lng
        };
        newPorts.push(p);
    }

    // Sort alphabetically by port name
    newPorts.sort((a, b) => a.port_name.localeCompare(b.port_name));
    allPorts = newPorts;
    loading.classList.add('hidden');
}

function parseLanes(laneParent) {
    if (!laneParent) return null;

    return {
        maximum_lanes: laneParent.getElementsByTagName('maximum_lanes')[0]?.textContent,
        standard: parseLaneDetails(laneParent.getElementsByTagName('standard_lanes')[0]),
        fast: parseLaneDetails(laneParent.getElementsByTagName('FAST_lanes')[0]),
        nexus_sentri: parseLaneDetails(laneParent.getElementsByTagName('NEXUS_SENTRI_lanes')[0]),
        ready: parseLaneDetails(laneParent.getElementsByTagName('ready_lanes')[0])
    };
}

function parseLaneDetails(laneNode) {
    if (!laneNode) return null;
    const opStatus = laneNode.getElementsByTagName('operational_status')[0]?.textContent;

    return {
        operational_status: opStatus,
        delay_minutes: laneNode.getElementsByTagName('delay_minutes')[0]?.textContent,
        lanes_open: laneNode.getElementsByTagName('lanes_open')[0]?.textContent,
        update_time: laneNode.getElementsByTagName('update_time')[0]?.textContent,
        isClosedOrNA: !opStatus || opStatus === 'N/A' || opStatus === 'Lanes Closed'
    };
}

function toggleFavorite(portNum, btn) {
    const idx = favorites.indexOf(portNum);
    if (idx > -1) {
        favorites.splice(idx, 1);
        btn.classList.remove('active');
    } else {
        favorites.push(portNum);
        btn.classList.add('active', 'pulse');
        setTimeout(() => btn.classList.remove('pulse'), 300);
    }
    localStorage.setItem('bwtFavorites', JSON.stringify(favorites));

    if (currentFilter === 'fav') {
        render(); // remove from view if untoggled in fav tab
    }
}

function render() {
    const query = searchInput.value.toLowerCase().trim();

    filteredPorts = allPorts.filter(p => {
        let matchStr = p.port_name.toLowerCase();
        if (p.crossing_name && p.crossing_name !== 'N/A') {
            matchStr += ' ' + p.crossing_name.toLowerCase();
        }
        const matchesSearch = matchStr.includes(query);
        const matchesTab = currentFilter === 'all' || favorites.includes(p.port_number);
        const matchesStatus = currentStatus === 'all' ||
            (currentStatus === 'open' && p.port_status?.toLowerCase() === 'open') ||
            (currentStatus === 'closed' && p.port_status?.toLowerCase() !== 'open');
        return matchesSearch && matchesTab && matchesStatus;
    });

    // Apply sorting
    if (currentSort === 'nearest' && userLocation) {
        filteredPorts.sort((a, b) => {
            const distA = (a.lat && a.lng) ? haversine(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
            const distB = (b.lat && b.lng) ? haversine(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
            return distA - distB;
        });
    } else if (currentSort === 'shortest') {
        filteredPorts.sort((a, b) => getPortWaitTime(a) - getPortWaitTime(b));
    } else if (currentSort === 'longest') {
        filteredPorts.sort((a, b) => getPortWaitTime(b) - getPortWaitTime(a));
    } else {
        // alpha sort, but within regions when showing all regions
        filteredPorts.sort((a, b) => a.port_name.localeCompare(b.port_name));
    }

    grid.innerHTML = '';

    if (filteredPorts.length === 0) {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
        updatePortCount(0);
        return;
    }

    grid.classList.remove('hidden');
    noResults.classList.add('hidden');
    updatePortCount(filteredPorts.length);

    const cardTemplate = document.getElementById('port-card-template');

    filteredPorts.forEach(port => grid.appendChild(renderPortCard(cardTemplate, port)));
}

function renderPortCard(cardTemplate, port) {
    const clone = cardTemplate.content.cloneNode(true);
    const card = clone.querySelector('.port-card');

    // Title Case conversion for ALL CAPS names
    const portName = toTitleCase(port.port_name);
    const crossingName = port.crossing_name && port.crossing_name.trim() !== '' && port.crossing_name !== 'N/A'
        ? toTitleCase(port.crossing_name) : '';
    clone.querySelector('.port-name').textContent = crossingName
        ? `${portName} — ${crossingName}`
        : portName;

    const statusBadge = clone.querySelector('.port-status');
    const status = port.port_status || 'Unknown';
    statusBadge.textContent = status;
    const isOpen = status.toLowerCase() === 'open';
    statusBadge.classList.add(isOpen ? 'open' : 'closed');
    card.classList.add(isOpen ? 'status-open' : 'status-closed');

    clone.querySelector('.hours-text').textContent = port.hours || '';

    // Show distance if using nearest sort
    if (currentSort === 'nearest' && userLocation && port.lat && port.lng) {
        const dist = haversine(userLocation.lat, userLocation.lng, port.lat, port.lng);
        const distText = dist < 1 ? `${(dist * 1000).toFixed(0)}m away` : `${dist.toFixed(0)} km away`;
        const distEl = document.createElement('span');
        distEl.className = 'distance-badge';
        distEl.textContent = `📍 ${distText}`;
        clone.querySelector('.card-subtitle').appendChild(distEl);
    }

    const favBtn = clone.querySelector('.fav-btn');
    if (favorites.includes(port.port_number)) {
        favBtn.classList.add('active');
    }
    favBtn.addEventListener('click', () => toggleFavorite(port.port_number, favBtn));

    const lanesContainer = clone.querySelector('.lanes-container');

    // Order: Vehicles → Pedestrians → Commercial
    renderCategory(lanesContainer, 'Passenger Vehicles', port.passenger, 'passenger');
    renderCategory(lanesContainer, 'Pedestrians', port.pedestrian, 'pedestrian');
    renderCategory(lanesContainer, 'Commercial Vehicles', port.commercial, 'commercial');

    // Remove container if empty
    if (lanesContainer.children.length === 0) {
        lanesContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.875rem;">No lane data available.</p>';
    }

    // Dim card if ALL categories are pending/closed (#6)
    const allPending = isCardFullyPending(port);
    if (allPending) card.classList.add('card-pending');

    return clone;
}

function renderCategory(container, title, data, type) {
    if (!data) return;

    const categoryIcons = {
        passenger: '<svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>',
        pedestrian: '<svg viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>',
        commercial: '<svg viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>'
    };

    // Helper: check if lane has real renderable data (not pending/closed/NA)
    const isLaneActive = (lane) => lane && !lane.isClosedOrNA && lane.operational_status !== 'Update Pending';

    // Check if there's any active lane types with real data
    const hasRealData = isLaneActive(data.standard) || isLaneActive(data.fast) ||
        isLaneActive(data.ready) || isLaneActive(data.nexus_sentri);

    // Check if there's any pending lanes
    const hasPendingLanes = ['standard', 'nexus_sentri', 'ready', 'fast']
        .some(k => data[k] && data[k].operational_status === 'Update Pending');

    // #3: Hide category if no real data AND no pending data
    if (!hasRealData && !hasPendingLanes) return;

    const tpl = document.getElementById('lane-category-template').content.cloneNode(true);
    const categoryDiv = tpl.querySelector('.lane-category');
    tpl.querySelector('.category-title').textContent = title;
    tpl.querySelector('.category-icon').innerHTML = categoryIcons[type] || '';
    const typesContainer = tpl.querySelector('.lane-types');

    let addedType = false;

    // Lane order: SENTRI → Ready → Standard → FAST
    if (isLaneActive(data.nexus_sentri)) addedType |= renderLaneType(typesContainer, 'SENTRI/NEXUS', data.nexus_sentri);
    if (isLaneActive(data.ready)) addedType |= renderLaneType(typesContainer, 'Ready Lane', data.ready);
    if (isLaneActive(data.standard)) addedType |= renderLaneType(typesContainer, 'Standard', data.standard);
    if (isLaneActive(data.fast)) addedType |= renderLaneType(typesContainer, 'FAST', data.fast);

    // #1: Collapse all-pending lanes into single message
    if (!addedType) {
        const allPending = ['standard', 'nexus_sentri', 'ready', 'fast']
            .some(k => data[k] && data[k].operational_status === 'Update Pending');
        if (allPending) {
            typesContainer.innerHTML = `<div class="pending-message">⏳ Awaiting data update</div>`;
        } else {
            return; // truly empty, hide category
        }
    }

    container.appendChild(categoryDiv);
}

function renderLaneType(container, name, details) {
    if (!details || details.isClosedOrNA) return false;

    const tpl = document.getElementById('lane-type-template').content.cloneNode(true);
    tpl.querySelector('.lane-name').textContent = name;

    const badge = tpl.querySelector('.delay-badge');
    const delay = details.delay_minutes;

    if (!delay || delay === '') {
        badge.textContent = details.operational_status || 'N/A';
        badge.classList.add('na');
    } else {
        badge.textContent = delay === '0' ? 'No Delay' : `${delay} min`;
        const mins = parseInt(delay);
        // #9: Smoother continuous color gradient
        badge.style.background = getDelayColor(mins, 0.2);
        badge.style.color = getDelayColor(mins, 1);
    }

    let detailsText = '';
    if (details.lanes_open && details.lanes_open !== '0') {
        detailsText = `${details.lanes_open} lane${details.lanes_open !== '1' ? 's' : ''} open`;
    } else {
        detailsText = details.operational_status === 'Update Pending' ? 'Update Pending' : 'Lanes info N/A';
    }

    tpl.querySelector('.lanes-open').textContent = detailsText;
    tpl.querySelector('.lane-update-time').textContent = details.update_time || '';

    container.appendChild(tpl);
    return true;
}

// Format date/time from XML into readable format: "Feb 25, 2026 8:05 PM"
function formatDateTime(dateStr, timeStr) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    try {
        const parts = dateStr.trim().split(/[-\/]/);
        // Handle both YYYY-M-D and M/D/YYYY formats
        let year, month, day;
        if (parts[0].length === 4) {
            year = parts[0]; month = parseInt(parts[1]); day = parseInt(parts[2]);
        } else {
            month = parseInt(parts[0]); day = parseInt(parts[1]); year = parts[2];
        }
        const timeParts = timeStr.trim().split(':');
        let hours = parseInt(timeParts[0]);
        const mins = timeParts[1]?.padStart(2, '0') || '00';
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${months[month - 1]} ${day}, ${year} ${hours}:${mins} ${ampm}`;
    } catch (e) {
        return `${dateStr} ${timeStr}`;
    }
}

// #9: Continuous color gradient: green(0) → amber(15) → orange(30) → red(60+)
function getDelayColor(mins, alpha) {
    let h, s, l;
    if (mins <= 0) { h = 160; s = 80; l = 50; }       // green
    else if (mins <= 15) { h = 160 - (mins / 15) * 120; s = 80; l = 50; } // green→amber
    else if (mins <= 30) { h = 40 - ((mins - 15) / 15) * 20; s = 85; l = 50; } // amber→orange
    else { h = Math.max(0, 20 - ((mins - 30) / 30) * 20); s = 90; l = Math.max(40, 50 - (mins - 30) * 0.15); } // orange→red
    return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

// #4: Title Case conversion
function toTitleCase(str) {
    if (!str) return '';
    // Words that should stay uppercase (acronyms, Roman numerals)
    const keepUpper = ['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
        'B&M', 'PDN', 'DCL', 'CBX', 'USA', 'US', 'BOTA', 'FAST'];
    // Words that should be lowercase
    const keepLower = ['of', 'the', 'and', 'in', 'at', 'to', 'for', 'on', 'by'];

    return str.split(/(\s+)/).map((token, i) => {
        if (/^\s+$/.test(token)) return token; // preserve whitespace
        // Check if entire token (or token without trailing punctuation) should stay uppercase
        const clean = token.replace(/[^A-Z&]/gi, '');
        if (keepUpper.includes(clean.toUpperCase()) || keepUpper.includes(token.toUpperCase())) {
            return token.toUpperCase();
        }
        const lower = token.toLowerCase();
        // Keep articles/prepositions lowercase (except first word)
        if (i > 0 && keepLower.includes(lower)) return lower;
        // Standard title case
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join('');
}

// #8: Port count indicator
function updatePortCount(count) {
    let counter = document.getElementById('port-count');
    if (!counter) {
        counter = document.createElement('span');
        counter.id = 'port-count';
        counter.className = 'port-count';
        const toolbar = document.querySelector('.toolbar-row:last-child');
        const statusFilters = toolbar.querySelector('.status-filters');
        statusFilters.parentNode.insertBefore(counter, statusFilters);
    }
    const label = currentFilter === 'fav' ? 'favorite' : '';
    const statusLabel = currentStatus !== 'all' ? ` ${currentStatus}` : '';
    counter.textContent = `${count}${statusLabel} ${label} port${count !== 1 ? 's' : ''}`;
}

// #6: Check if all categories are pending
function isCardFullyPending(port) {
    const cats = [port.passenger, port.pedestrian, port.commercial];
    let hasAnyCat = false;
    for (const cat of cats) {
        if (!cat) continue;
        hasAnyCat = true;
        const lanes = [cat.standard, cat.nexus_sentri, cat.ready, cat.fast];
        for (const lane of lanes) {
            if (lane && !lane.isClosedOrNA && lane.operational_status !== 'Update Pending') return false;
        }
    }
    return hasAnyCat;
}

// Get the primary wait time for sorting (passenger vehicle standard lane)
function getPortWaitTime(port) {
    const delay = port.passenger?.standard?.delay_minutes;
    if (!delay || delay === '' || isNaN(delay)) return currentSort === 'shortest' ? Infinity : -1;
    return parseInt(delay);
}

// Geolocation
function requestUserLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            // Auto-select nearest if this is the first time
            if (currentSort === 'alpha') {
                currentSort = 'nearest';
                sortSelect.value = 'nearest';
            }
            render();
        },
        () => { /* user denied — no-op */ },
        { timeout: 5000, maximumAge: 60000 }
    );
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Run
init();

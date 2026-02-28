const API_URL = '/api/bwt';
let allPorts = [];
let filteredPorts = [];
let favorites = JSON.parse(localStorage.getItem('bwtFavorites')) || [];
let currentFilter = 'all'; // 'all' or 'fav'
let currentStatus = 'all'; // 'all', 'open', 'closed'
let currentSort = 'alpha'; // 'alpha', 'shortest', 'longest'
let nextRefreshTime = 0;
let refreshInterval, countdownInterval;

// DOM Elements
const grid = document.getElementById('ports-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
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
        lastUpdatedEl.textContent = `Updated: ${updateDate} ${updateTime}`;
    }

    const newPorts = [];

    for (let i = 0; i < portNodes.length; i++) {
        const port = portNodes[i];
        const border = port.getElementsByTagName('border')[0]?.textContent;

        // Only include Mexican Border
        if (border !== 'Mexican Border') continue;

        const p = {
            port_number: port.getElementsByTagName('port_number')[0]?.textContent,
            port_name: port.getElementsByTagName('port_name')[0]?.textContent,
            crossing_name: port.getElementsByTagName('crossing_name')[0]?.textContent,
            hours: port.getElementsByTagName('hours')[0]?.textContent,
            port_status: port.getElementsByTagName('port_status')[0]?.textContent,
            passenger: parseLanes(port.getElementsByTagName('passenger_vehicle_lanes')[0]),
            commercial: parseLanes(port.getElementsByTagName('commercial_vehicle_lanes')[0]),
            pedestrian: parseLanes(port.getElementsByTagName('pedestrian_lanes')[0])
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
    if (currentSort === 'alpha') {
        filteredPorts.sort((a, b) => a.port_name.localeCompare(b.port_name));
    } else if (currentSort === 'shortest') {
        filteredPorts.sort((a, b) => getPortWaitTime(a) - getPortWaitTime(b));
    } else if (currentSort === 'longest') {
        filteredPorts.sort((a, b) => getPortWaitTime(b) - getPortWaitTime(a));
    }

    grid.innerHTML = '';

    if (filteredPorts.length === 0) {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    noResults.classList.add('hidden');

    const cardTemplate = document.getElementById('port-card-template');

    filteredPorts.forEach(port => {
        const clone = cardTemplate.content.cloneNode(true);
        const card = clone.querySelector('.port-card');

        clone.querySelector('.port-name').textContent = port.port_name;
        if (port.crossing_name && port.crossing_name.trim() !== '') {
            clone.querySelector('.crossing-name').textContent = port.crossing_name;
        } else {
            clone.querySelector('.crossing-name').remove();
        }

        const statusBadge = clone.querySelector('.port-status');
        const status = port.port_status || 'Unknown';
        statusBadge.textContent = status;
        statusBadge.classList.add(status.toLowerCase() === 'open' ? 'open' : 'closed');

        clone.querySelector('.hours-text').textContent = port.hours || 'Hours N/A';

        const favBtn = clone.querySelector('.fav-btn');
        if (favorites.includes(port.port_number)) {
            favBtn.classList.add('active');
        }
        favBtn.addEventListener('click', () => toggleFavorite(port.port_number, favBtn));

        const lanesContainer = clone.querySelector('.lanes-container');

        renderCategory(lanesContainer, 'Passenger Vehicles', port.passenger);
        renderCategory(lanesContainer, 'Commercial Vehicles', port.commercial);
        renderCategory(lanesContainer, 'Pedestrians', port.pedestrian);

        // Remove container if empty
        if (lanesContainer.children.length === 0) {
            lanesContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.875rem;">No lane data available.</p>';
        }

        grid.appendChild(clone);
    });
}

function renderCategory(container, title, data) {
    if (!data) return;

    // Check if there's any active lane types
    const hasData = (data.standard && !data.standard.isClosedOrNA) ||
        (data.fast && !data.fast.isClosedOrNA) ||
        (data.ready && !data.ready.isClosedOrNA) ||
        (data.nexus_sentri && !data.nexus_sentri.isClosedOrNA);

    // If no data and max lanes is N/A, '0', or closed, skip
    if (!hasData) {
        // Only return if it's completely N/A. Let's show "All lanes closed" otherwise.
        if (!data.maximum_lanes || data.maximum_lanes === 'N/A' || data.maximum_lanes === '0') {
            return;
        }
    }

    const tpl = document.getElementById('lane-category-template').content.cloneNode(true);
    const categoryDiv = tpl.querySelector('.lane-category');
    tpl.querySelector('.category-title').textContent = title;
    const typesContainer = tpl.querySelector('.lane-types');

    let addedType = false;

    if (data.standard && !data.standard.isClosedOrNA) addedType |= renderLaneType(typesContainer, 'Standard', data.standard);
    if (data.nexus_sentri && !data.nexus_sentri.isClosedOrNA) addedType |= renderLaneType(typesContainer, 'SENTRI/NEXUS', data.nexus_sentri);
    if (data.ready && !data.ready.isClosedOrNA) addedType |= renderLaneType(typesContainer, 'Ready Lane', data.ready);
    if (data.fast && !data.fast.isClosedOrNA) addedType |= renderLaneType(typesContainer, 'FAST', data.fast);

    if (!addedType) {
        typesContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-secondary);">All lanes closed or N/A</div>`;
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
        if (mins <= 30) badge.classList.add('green');
        else if (mins <= 60) badge.classList.add('amber');
        else badge.classList.add('red');
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
// Get the primary wait time for sorting (passenger vehicle standard lane)
function getPortWaitTime(port) {
    const delay = port.passenger?.standard?.delay_minutes;
    if (!delay || delay === '' || isNaN(delay)) return currentSort === 'shortest' ? Infinity : -1;
    return parseInt(delay);
}

// Run
init();

const API_URL = '/api/bwt';
let allPorts = [];
let filteredPorts = [];
let favorites = JSON.parse(localStorage.getItem('bwtFavorites')) || [];
let currentFilter = 'all'; // 'all' or 'fav'
let currentSort = 'alpha'; // 'alpha', 'shortest', 'longest', 'nearest'
let userLocation = null; // {lat, lng}
let refreshInterval;
let currentLang = localStorage.getItem('bwtLang') || 'es';
let lastUpdateDate = '';
let lastUpdateTime = '';
let supabaseClient = null;
let supabaseReady = false;
let installationId = '';
let currentPortAlerts = [];
let alertLoadCounter = 0;
let laneComparisonLoadCounter = 0;
let currentLaneComparisons = {};
let pushReady = false;
let pushState = null;
let pushToastTimer = null;
let dailyGuidanceSnapshot = null;
let dailyGuidanceLoadPromise = null;
let dailyGuidanceSyncPromise = null;
let cardGuidanceHydrated = false;
let cardGuidanceHydrationPromise = null;
let alertThresholdDrafts = {};

// Translations
const TRANSLATIONS = {
    es: {
        tabAll: 'Todas las Garitas',
        tabFav: 'Favoritas <span class="star-icon">★</span>',
        searchPlaceholder: 'Buscar por garita, cruce o ciudad...',
        sortAlpha: 'A → Z',
        sortShortest: 'Menor Espera',
        sortLongest: 'Mayor Espera',
        sortNearest: '📍 Más Cerca',
        loading: 'Obteniendo datos de la frontera...',
        noResults: 'No se encontraron garitas',
        noResultsHint: 'Intenta ajustar tu búsqueda o revisa tus favoritos.',
        errorTitle: 'Error al cargar datos',
        errorMsg: 'Inténtalo más tarde. Asegúrate de que el servidor esté activo.',
        nextRefresh: 'Próxima actualización en',
        updated: 'Actualizado:',
        loadingBadge: 'Cargando...',
        passengerVehicles: 'Vehículos de Pasajeros',
        pedestrians: 'Peatones',
        commercialVehicles: 'Vehículos Comerciales',
        standard: 'Estándar',
        readyLane: 'Ready Lane',
        sentriNexus: 'SENTRI/NEXUS',
        fast: 'FAST',
        noLaneData: 'Sin datos de carril disponibles.',
        pendingUpdate: '⏳ Esperando actualización de datos',
        lanesOpen: 'carriles abiertos',
        laneOpen: 'carril abierto',
        noDelay: 'Sin Demora',
        statusOpen: 'Abierta',
        statusClosed: 'Cerrada',
        activeLane: 'carril activo',
        activeLanes: 'carriles activos',
        kmAway: 'km de distancia',
        mAway: 'm de distancia',
        footerDisclaimer: 'Datos obtenidos de U.S. Customs and Border Protection. Sin afiliación ni respaldo de ninguna agencia gubernamental.',
        alertsTitle: 'Alertas de espera',
        alertsSubtitle: 'Elige un carril, define tu tiempo ideal y te avisaremos cuando baje.',
        alertsMinutesUnit: 'min',
        alertsLoading: 'Cargando alertas...',
        alertsWaitingForSupabase: 'Conectando alertas...',
        alertsCurrentWaitMissing: 'No hay datos activos para esta combinación de carril.',
        alertsSaveSuccess: 'Alerta guardada.',
        alertsDeleteSuccess: 'Alerta eliminada.',
        alertsSaveError: 'No se pudo guardar la alerta.',
        alertsDeleteError: 'No se pudo eliminar la alerta.',
        alertsDuplicate: 'Ya existe una alerta igual para esta garita.',
        alertsInvalidThreshold: 'Ingresa un tiempo válido entre 0 y 600 minutos.',
        alertsSchemaMissing: 'Falta crear la tabla de alertas en Supabase.',
        alertsLaneCurrent: 'Espera actual',
        alertsLaneTargetLabel: 'Avísame cuando baje de',
        alertsLaneSetButton: 'Crear alerta',
        alertsLaneSavedLabel: 'Alertas activas',
        alertsLaneNoSaved: 'Sin alertas para este carril.',
        pushTitle: 'Notificaciones web',
        pushEnableButton: 'Activar notificaciones',
        pushDisableButton: 'Desactivar',
        pushLoading: 'Revisando notificaciones...',
        pushUnsupported: 'Este navegador no soporta notificaciones push web.',
        pushConfigMissing: 'Falta configurar la llave Web Push de Firebase.',
        pushReadyState: 'Activa las notificaciones para recibir alertas en este navegador.',
        pushEnabled: 'Las notificaciones web están activas en este navegador.',
        pushDenied: 'Las notificaciones están bloqueadas en este navegador.',
        pushRegistering: 'Activando notificaciones...',
        pushRegisterSuccess: 'Notificaciones activadas.',
        pushRegisterError: 'No se pudieron activar las notificaciones.',
        pushDisableSuccess: 'Notificaciones desactivadas para este navegador.',
        pushDisableError: 'No se pudieron desactivar las notificaciones.',
        pushSchemaMissing: 'Falta crear la tabla de suscripciones push en Supabase.',
        pushAlertPrompt: 'Te pediremos permiso para notificaciones cuando guardes tu primera alerta.',
        pushAlertReady: 'Las notificaciones ya están activas. Las nuevas alertas avisarán en este navegador.',
        pushAlertRequired: 'Activa las notificaciones en este navegador para guardar alertas.',
        pushBrowserLinkError: 'No se pudo vincular este navegador para notificaciones. Intenta recargar la página y volver a activar las notificaciones.',
        pushToastOpen: 'Abrir',
        trendFasterThanUsual: 'Más rápido de lo usual',
        trendSlowerThanUsual: 'Más lento de lo usual',
        trendAboutNormal: 'Normal para esta hora',
        bestHoursLabel: 'Mejores horas',
        travelPassenger: 'Vehículos de Pasajeros',
        travelPedestrian: 'Peatones',
        travelCommercial: 'Vehículos Comerciales',
    },
    en: {
        tabAll: 'All Ports',
        tabFav: 'Favorites <span class="star-icon">★</span>',
        searchPlaceholder: 'Search by port, crossing, or city...',
        sortAlpha: 'A → Z',
        sortShortest: 'Shortest Wait',
        sortLongest: 'Longest Wait',
        sortNearest: '📍 Nearest',
        loading: 'Fetching latest border data...',
        noResults: 'No ports found',
        noResultsHint: 'Try adjusting your search or check your favorites.',
        errorTitle: 'Error loading data',
        errorMsg: 'Please try again later. Make sure the proxy server is running.',
        nextRefresh: 'Next refresh in',
        updated: 'Updated:',
        loadingBadge: 'Loading...',
        passengerVehicles: 'Passenger Vehicles',
        pedestrians: 'Pedestrians',
        commercialVehicles: 'Commercial Vehicles',
        standard: 'Standard',
        readyLane: 'Ready Lane',
        sentriNexus: 'SENTRI/NEXUS',
        fast: 'FAST',
        noLaneData: 'No lane data available.',
        pendingUpdate: '⏳ Awaiting data update',
        lanesOpen: 'lanes open',
        laneOpen: 'lane open',
        noDelay: 'No Delay',
        statusOpen: 'Open',
        statusClosed: 'Closed',
        activeLane: 'active lane',
        activeLanes: 'active lanes',
        kmAway: 'km away',
        mAway: 'm away',
        footerDisclaimer: 'Data sourced from U.S. Customs and Border Protection. Not affiliated with or endorsed by any government agency.',
        alertsTitle: 'Wait time alerts',
        alertsSubtitle: 'Pick a lane, choose your target wait, and we’ll notify you when it drops.',
        alertsMinutesUnit: 'min',
        alertsLoading: 'Loading alerts...',
        alertsWaitingForSupabase: 'Connecting alerts...',
        alertsCurrentWaitMissing: 'There is no live data for that lane combination.',
        alertsSaveSuccess: 'Alert saved.',
        alertsDeleteSuccess: 'Alert deleted.',
        alertsSaveError: 'Could not save the alert.',
        alertsDeleteError: 'Could not delete the alert.',
        alertsDuplicate: 'An identical alert already exists for this port.',
        alertsInvalidThreshold: 'Enter a valid time between 0 and 600 minutes.',
        alertsSchemaMissing: 'The alerts table has not been created in Supabase yet.',
        alertsLaneCurrent: 'Current wait',
        alertsLaneTargetLabel: 'Alert me when it drops below',
        alertsLaneSetButton: 'Set alert',
        alertsLaneSavedLabel: 'Active alerts',
        alertsLaneNoSaved: 'No alerts for this lane yet.',
        pushTitle: 'Web notifications',
        pushEnableButton: 'Enable notifications',
        pushDisableButton: 'Disable',
        pushLoading: 'Checking notifications...',
        pushUnsupported: 'This browser does not support web push notifications.',
        pushConfigMissing: 'The Firebase Web Push key is not configured yet.',
        pushReadyState: 'Enable notifications to receive alerts in this browser.',
        pushEnabled: 'Web notifications are active in this browser.',
        pushDenied: 'Notifications are blocked in this browser.',
        pushRegistering: 'Enabling notifications...',
        pushRegisterSuccess: 'Notifications enabled.',
        pushRegisterError: 'Could not enable notifications.',
        pushDisableSuccess: 'Notifications disabled for this browser.',
        pushDisableError: 'Could not disable notifications.',
        pushSchemaMissing: 'The push subscriptions table has not been created in Supabase yet.',
        pushAlertPrompt: 'We’ll ask for notification permission when you save your first alert.',
        pushAlertReady: 'Notifications are already active. New alerts will notify this browser.',
        pushAlertRequired: 'Enable notifications in this browser to save alerts.',
        pushBrowserLinkError: 'Could not link this browser for notifications. Try refreshing the page and enabling notifications again.',
        pushToastOpen: 'Open',
        trendFasterThanUsual: 'Faster than usual',
        trendSlowerThanUsual: 'Slower than usual',
        trendAboutNormal: 'About normal right now',
        bestHoursLabel: 'Best hours',
        travelPassenger: 'Passenger Vehicles',
        travelPedestrian: 'Pedestrians',
        travelCommercial: 'Commercial Vehicles',
    }
};

const ALERT_TRAVEL_MODE_LABELS = {
    passenger: 'travelPassenger',
    pedestrian: 'travelPedestrian',
    commercial: 'travelCommercial',
};

const ALERT_LANE_LABELS = {
    standard: 'standard',
    ready: 'readyLane',
    nexus_sentri: 'sentriNexus',
    fast: 'fast',
};

function isSupportedTravelMode(travelMode) {
    return travelMode === 'passenger' || travelMode === 'pedestrian';
}

function isSupportedLaneType(laneType) {
    return laneType === 'standard' || laneType === 'ready' || laneType === 'nexus_sentri';
}

const LANE_HISTORY_PORT_FALLBACKS = {
    '250609': '250601',
};

function getDetailLaneRenderOptions(comparisons = {}) {
    return {
        comparisons,
        includeNormalTrend: false,
        layout: 'card',
        showComparison: true,
        showGuidance: true,
    };
}

const DAILY_GUIDANCE_CACHE_KEY = 'garitaWatchDailyGuidanceCache';
const DAILY_GUIDANCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function t(key) { return TRANSLATIONS[currentLang][key] || TRANSLATIONS['en'][key] || key; }

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('bwtLang', lang);
    document.documentElement.lang = lang;

    // Update toggle button active state
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // Update all data-i18n text elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[lang][key]) el.innerHTML = TRANSLATIONS[lang][key];
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (TRANSLATIONS[lang][key]) el.placeholder = TRANSLATIONS[lang][key];
    });

    // Update sort options
    const sortOpts = document.getElementById('sort-select');
    if (sortOpts) {
        sortOpts.querySelectorAll('option[data-i18n]').forEach(opt => {
            const key = opt.getAttribute('data-i18n');
            if (TRANSLATIONS[lang][key]) opt.textContent = TRANSLATIONS[lang][key];
        });
        // Nearest option (no data-i18n, always emoji)
        const nearestOpt = sortOpts.querySelector('option[value="nearest"]');
        if (nearestOpt) nearestOpt.textContent = t('sortNearest');
    }

    // Update the "Updated:" badge text
    updateLastUpdatedBadge();

    // Re-render cards with new language
    if (allPorts.length > 0) render();
    if (activeDetailPort) {
        openPortDetail(activeDetailPort, lastFocusedCard);
    }
    updatePushControls();
}

function initializeSupabaseAlerts() {
    const applySupabaseReady = () => {
        supabaseClient = window.garitaWatchSupabase || null;
        installationId = window.garitaWatchInstallationId || '';
        supabaseReady = Boolean(supabaseClient);
        cardGuidanceHydrated = false;
        cardGuidanceHydrationPromise = null;
        updateAlertsConnectionBadge();

        if (allPorts.length > 0) {
            render();
        }

        if (activeDetailPort) {
            void loadAlertsForPort(activeDetailPort);
            void loadLaneComparisonsForPort(activeDetailPort);
        } else {
            renderCurrentPortAlerts();
        }
    };

    window.addEventListener('garitaWatchSupabaseReady', applySupabaseReady);

    if (window.garitaWatchSupabase) {
        applySupabaseReady();
    } else {
        updateAlertsConnectionBadge();
        setAlertFormStatus(t('alertsWaitingForSupabase'), 'muted');
    }
}

function updateAlertsConnectionBadge() {
    // Alert UI no longer shows a connection badge.
}

function getLaneComparisonKey(travelMode, laneType) {
    return `${travelMode}:${laneType}`;
}

function resolveLaneHistoryPortNumber(port) {
    return LANE_HISTORY_PORT_FALLBACKS[port?.port_number] || port?.port_number || null;
}

function readDailyGuidanceCache() {
    try {
        const raw = localStorage.getItem(DAILY_GUIDANCE_CACHE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.rows)) {
            return null;
        }

        return parsed;
    } catch (error) {
        console.warn('Unable to read daily guidance cache:', error);
        return null;
    }
}

function writeDailyGuidanceCache(snapshot) {
    try {
        if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
            localStorage.removeItem(DAILY_GUIDANCE_CACHE_KEY);
            return;
        }

        localStorage.setItem(DAILY_GUIDANCE_CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
        console.warn('Unable to persist daily guidance cache:', error);
    }
}

function normalizeDailyGuidanceSnapshot(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            expiresAt: null,
            generatedAt: null,
            rows: [],
            snapshotDate: null,
        };
    }

    const [firstRow] = rows;

    return {
        expiresAt: firstRow.expires_at || null,
        generatedAt: firstRow.generated_at || null,
        rows,
        snapshotDate: firstRow.snapshot_date || null,
    };
}

function isDailyGuidanceSnapshotFresh(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
        return false;
    }

    const expiresAt = snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : NaN;
    if (Number.isFinite(expiresAt)) {
        return Date.now() < expiresAt;
    }

    const generatedAt = snapshot.generatedAt ? Date.parse(snapshot.generatedAt) : NaN;
    return Number.isFinite(generatedAt) && (Date.now() - generatedAt) < DAILY_GUIDANCE_MAX_AGE_MS;
}

async function fetchDailyGuidanceSnapshot() {
    const { data, error } = await supabaseClient.rpc('get_current_port_lane_daily_guidance', {
        in_port_number: null,
    });

    if (error) {
        throw error;
    }

    const snapshot = normalizeDailyGuidanceSnapshot(data || []);
    dailyGuidanceSnapshot = snapshot;
    writeDailyGuidanceCache(snapshot);
    return snapshot;
}

async function getDailyGuidanceSnapshot() {
    const cachedSnapshot = readDailyGuidanceCache();
    const inMemoryFresh = isDailyGuidanceSnapshotFresh(dailyGuidanceSnapshot);
    const cachedFresh = isDailyGuidanceSnapshotFresh(cachedSnapshot);

    if (inMemoryFresh) {
        return dailyGuidanceSnapshot;
    }

    if (cachedFresh) {
        dailyGuidanceSnapshot = cachedSnapshot;

        if (!supabaseReady || !supabaseClient) {
            return cachedSnapshot;
        }

        if (!dailyGuidanceSyncPromise) {
            dailyGuidanceSyncPromise = fetchDailyGuidanceSnapshot()
                .catch((error) => {
                    console.warn('Unable to refresh cached daily guidance snapshot:', error);
                    return cachedSnapshot;
                })
                .finally(() => {
                    dailyGuidanceSyncPromise = null;
                });
        }

        return dailyGuidanceSyncPromise;
    }

    if (!supabaseReady || !supabaseClient) {
        return cachedSnapshot || dailyGuidanceSnapshot;
    }

    if (dailyGuidanceLoadPromise) {
        return dailyGuidanceLoadPromise;
    }

    dailyGuidanceLoadPromise = fetchDailyGuidanceSnapshot()
        .catch((error) => {
            const fallbackSnapshot = cachedSnapshot || dailyGuidanceSnapshot;
            if (fallbackSnapshot?.rows?.length) {
                return fallbackSnapshot;
            }
            throw error;
        })
        .finally(() => {
            dailyGuidanceLoadPromise = null;
        });

    return dailyGuidanceLoadPromise;
}

function buildComparisonMapFromRows(rows) {
    return (rows || []).reduce((acc, row) => {
        acc[getLaneComparisonKey(row.travel_mode, row.lane_type)] = row;
        return acc;
    }, {});
}

function getDailyGuidanceComparisonsForPort(port, snapshot) {
    if (!port || !snapshot?.rows?.length) {
        return {};
    }

    const exactPortNumber = port.port_number;
    const fallbackPortNumber = resolveLaneHistoryPortNumber(port);

    let rows = snapshot.rows.filter((row) => row.port_number === exactPortNumber);

    if (rows.length === 0 && fallbackPortNumber && fallbackPortNumber !== exactPortNumber) {
        rows = snapshot.rows.filter((row) => row.port_number === fallbackPortNumber);
    }

    return buildComparisonMapFromRows(rows);
}

function getTrendLabel(comparison, options = {}) {
    const { includeNormal = true } = options;

    if (!comparison || comparison.trend_label === 'not_enough_data') {
        return null;
    }

    if (comparison.trend_label === 'faster_than_usual') {
        return {
            className: 'is-faster',
            text: t('trendFasterThanUsual'),
        };
    }

    if (comparison.trend_label === 'slower_than_usual') {
        return {
            className: 'is-slower',
            text: t('trendSlowerThanUsual'),
        };
    }

    if (comparison.trend_label === 'about_normal') {
        if (!includeNormal) {
            return null;
        }

        return {
            className: 'is-normal',
            text: t('trendAboutNormal'),
        };
    }

    return null;
}

function getBestHoursEntries(comparison) {
    if (!Array.isArray(comparison?.best_hours_json) || comparison.best_hours_json.length === 0) {
        return [];
    }

    return comparison.best_hours_json
        .map((entry) => {
            const hour = Number.parseInt(entry?.hour, 10);
            if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
                return null;
            }

            return {
                averageDelayMinutes: typeof entry?.average_delay_minutes === 'number'
                    ? entry.average_delay_minutes
                    : Number.parseFloat(entry?.average_delay_minutes),
                hour,
                sampleCount: Number.parseInt(entry?.sample_count, 10) || 0,
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.hour - right.hour);
}

function formatBestHour(hour) {
    try {
        const locale = currentLang === 'es' ? 'es-MX' : 'en-US';
        const date = new Date(Date.UTC(2000, 0, 1, hour, 0, 0));
        return new Intl.DateTimeFormat(locale, {
            hour: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    } catch (error) {
        if (currentLang === 'es') {
            if (hour === 0) return '12 a. m.';
            if (hour < 12) return `${hour} a. m.`;
            if (hour === 12) return '12 p. m.';
            return `${hour - 12} p. m.`;
        }

        if (hour === 0) return '12 AM';
        if (hour < 12) return `${hour} AM`;
        if (hour === 12) return '12 PM';
        return `${hour - 12} PM`;
    }
}

function formatBestHoursText(comparison) {
    const entries = getBestHoursEntries(comparison);
    if (entries.length === 0) {
        return null;
    }

    return entries
        .slice(0, 3)
        .map((entry) => formatBestHour(entry.hour))
        .join(', ');
}

function ensureCardGuidanceHydrated() {
    if (cardGuidanceHydrated || cardGuidanceHydrationPromise || !supabaseReady || !supabaseClient) {
        return;
    }

    cardGuidanceHydrationPromise = getDailyGuidanceSnapshot()
        .catch((error) => {
            console.warn('Unable to hydrate card lane guidance:', error);
            return dailyGuidanceSnapshot;
        })
        .then(() => {
            cardGuidanceHydrated = true;
            if (allPorts.length > 0) {
                render();
            }
        })
        .finally(() => {
            cardGuidanceHydrationPromise = null;
        });
}

async function loadLaneComparisonsForPort(port) {
    if (!portDetailLanes || !port) {
        return;
    }

    if (!supabaseReady || !supabaseClient) {
        currentLaneComparisons = {};
        if (activeDetailPort?.port_number === port.port_number) {
            populateLanesContainer(portDetailLanes, port, getDetailLaneRenderOptions(currentLaneComparisons));
        }
        return;
    }

    const loadId = ++laneComparisonLoadCounter;
    currentLaneComparisons = {};

    const exactPortNumber = port.port_number;
    const fallbackPortNumber = resolveLaneHistoryPortNumber(port);

    try {
        const dailySnapshot = await getDailyGuidanceSnapshot();
        const dailyComparisons = getDailyGuidanceComparisonsForPort(port, dailySnapshot);

        if (Object.keys(dailyComparisons).length > 0) {
            if (loadId !== laneComparisonLoadCounter) {
                return;
            }

            currentLaneComparisons = dailyComparisons;

            if (activeDetailPort?.port_number === port.port_number) {
                populateLanesContainer(portDetailLanes, port, getDetailLaneRenderOptions(currentLaneComparisons));
            }
            return;
        }

        let { data, error } = await supabaseClient.rpc('get_lane_wait_comparison', {
            in_lane_type: null,
            in_lookback_days: 7,
            in_minimum_samples: 12,
            in_port_number: exactPortNumber,
            in_travel_mode: null,
        });

        if (error) {
            throw error;
        }

        if ((!data || data.length === 0) && fallbackPortNumber && fallbackPortNumber !== exactPortNumber) {
            const fallbackResult = await supabaseClient.rpc('get_lane_wait_comparison', {
                in_lane_type: null,
                in_lookback_days: 7,
                in_minimum_samples: 12,
                in_port_number: fallbackPortNumber,
                in_travel_mode: null,
            });

            if (fallbackResult.error) {
                throw fallbackResult.error;
            }

            data = fallbackResult.data;
        }

        if (loadId !== laneComparisonLoadCounter) {
            return;
        }

        currentLaneComparisons = buildComparisonMapFromRows(data || []);
    } catch (error) {
        console.warn('Unable to load lane comparisons:', error);
        currentLaneComparisons = {};
    }

    if (activeDetailPort?.port_number === port.port_number) {
        populateLanesContainer(portDetailLanes, port, getDetailLaneRenderOptions(currentLaneComparisons));
    }
}

function initializePushNotifications() {
    const applyPushReady = async () => {
        pushReady = Boolean(window.garitaWatchPush);
        await refreshPushState();
    };

    window.addEventListener('garitaWatchPushReady', () => {
        void applyPushReady();
    });

    if (window.garitaWatchPush) {
        void applyPushReady();
    } else {
        setPushStatus(t('pushLoading'));
        updatePushControls();
    }

    window.addEventListener('garitaWatchPushMessage', (event) => {
        showPushToast(event.detail || {});
    });
}

function setPushStatus(message, kind = 'muted') {
    if (!pushPermissionStatus) return;

    pushPermissionStatus.textContent = message || '';
    pushPermissionStatus.classList.remove('is-success', 'is-error');

    if (kind === 'success') {
        pushPermissionStatus.classList.add('is-success');
    } else if (kind === 'error') {
        pushPermissionStatus.classList.add('is-error');
    }
}

function updatePushControls() {
    if (!pushReady || !window.garitaWatchPush?.hasBrowserPushSupport()) {
        setPushStatus(t('pushUnsupported'), 'error');
        return;
    }

    if (!window.garitaWatchPush.hasConfiguredVapidKey()) {
        setPushStatus(t('pushConfigMissing'), 'error');
        return;
    }

    if (pushState?.registered) {
        setPushStatus(t('pushAlertReady'), 'success');
        return;
    }

    if (pushState?.permission === 'denied') {
        setPushStatus(t('pushAlertRequired'), 'error');
    } else {
        setPushStatus(t('pushAlertPrompt'));
    }
}

async function refreshPushState() {
    if (!pushReady || !window.garitaWatchPush) {
        updatePushControls();
        return;
    }

    try {
        pushState = await window.garitaWatchPush.syncPushState();
    } catch (error) {
        console.error('Error syncing push state:', error);
    }

    updatePushControls();
}
// Static port data: region + coordinates for all Mexican border ports
// Region keys: ca-bc, az-son, nm-chih, tx-chih, tx-tamps
const PORT_DATA = {
    // California – Baja California
    '250201': { region: 'ca-bc', lat: 32.7194, lng: -114.6997 }, // Andrade
    '250301': { region: 'ca-bc', lat: 32.6781, lng: -115.4988 }, // Calexico East
    '250302': { region: 'ca-bc', lat: 32.6743, lng: -115.4992 }, // Calexico West
    '250601': { region: 'ca-bc', lat: 32.5503, lng: -116.9386 }, // Otay Mesa Passenger
    '250602': { region: 'ca-bc', lat: 32.5503, lng: -116.9386 }, // Otay Mesa Commercial
    '250608': { region: 'ca-bc', lat: 32.5503, lng: -116.9386 }, // Otay Mesa Port of Entry
    '250609': { region: 'ca-bc', lat: 32.5503, lng: -116.9386 }, // Otay Mesa
    '250401': { region: 'ca-bc', lat: 32.5412, lng: -117.0322 }, // San Ysidro
    '250407': { region: 'ca-bc', lat: 32.5425, lng: -117.0346 }, // San Ysidro PedWest
    '250409': { region: 'ca-bc', lat: 32.5413, lng: -116.9769 }, // San Ysidro Cross Border Express
    '250501': { region: 'ca-bc', lat: 32.5493, lng: -116.6289 }, // Tecate
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

const CITY_INDEX = [
    {
        name: 'Tijuana',
        aliases: ['tijuana', 'tj'],
        lat: 32.5149,
        lng: -117.0382,
        radiusKm: 30
    },
    {
        name: 'Mexicali',
        aliases: ['mexicali'],
        lat: 32.6245,
        lng: -115.4523,
        radiusKm: 35
    },
    {
        name: 'Tecate',
        aliases: ['tecate'],
        lat: 32.5667,
        lng: -116.6333,
        radiusKm: 25
    },
    {
        name: 'Nogales',
        aliases: ['nogales'],
        lat: 31.3086,
        lng: -110.9458,
        radiusKm: 25
    },
    {
        name: 'San Luis Rio Colorado',
        aliases: ['san luis rio colorado', 'san luis'],
        lat: 32.4561,
        lng: -114.7719,
        radiusKm: 25
    },
    {
        name: 'Agua Prieta',
        aliases: ['agua prieta', 'douglas'],
        lat: 31.3239,
        lng: -109.5489,
        radiusKm: 25
    },
    {
        name: 'Ciudad Juarez',
        aliases: ['ciudad juarez', 'juarez', 'cd juarez', 'el paso'],
        lat: 31.6904,
        lng: -106.4245,
        radiusKm: 60
    },
    {
        name: 'Puerto Palomas',
        aliases: ['puerto palomas', 'palomas', 'columbus'],
        lat: 31.7833,
        lng: -107.6333,
        radiusKm: 25
    },
    {
        name: 'San Jeronimo',
        aliases: ['san jeronimo', 'santa teresa'],
        lat: 31.7830,
        lng: -106.6735,
        radiusKm: 25
    },
    {
        name: 'Piedras Negras',
        aliases: ['piedras negras', 'eagle pass'],
        lat: 28.7000,
        lng: -100.5231,
        radiusKm: 25
    },
    {
        name: 'Acuña',
        aliases: ['acuna', 'acuña', 'del rio', 'ciudad acuna', 'ciudad acuña'],
        lat: 29.3232,
        lng: -100.9513,
        radiusKm: 25
    },
    {
        name: 'Nuevo Laredo',
        aliases: ['nuevo laredo', 'laredo'],
        lat: 27.4779,
        lng: -99.5496,
        radiusKm: 30
    },
    {
        name: 'Reynosa',
        aliases: ['reynosa', 'hidalgo', 'pharr'],
        lat: 26.0928,
        lng: -98.2770,
        radiusKm: 30
    },
    {
        name: 'Rio Bravo',
        aliases: ['rio bravo', 'progreso'],
        lat: 26.0497,
        lng: -97.9510,
        radiusKm: 25
    },
    {
        name: 'Matamoros',
        aliases: ['matamoros', 'brownsville'],
        lat: 25.8690,
        lng: -97.5027,
        radiusKm: 35
    },
    {
        name: 'Miguel Aleman',
        aliases: ['miguel aleman', 'miguel alemán', 'roma'],
        lat: 26.3988,
        lng: -99.0267,
        radiusKm: 25
    },
    {
        name: 'Camargo',
        aliases: ['camargo', 'rio grande city'],
        lat: 26.3144,
        lng: -98.8353,
        radiusKm: 25
    }
];

// DOM Elements
const grid = document.getElementById('ports-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
searchInput.placeholder = 'Search by port, crossing, or city...';
const tabAll = document.getElementById('tab-all');
const tabFav = document.getElementById('tab-fav');
const lastUpdatedEl = document.getElementById('last-updated');
const sortSelect = document.getElementById('sort-select');
const controlsSection = document.querySelector('.controls-section');
const portDetailModal = document.getElementById('port-detail-modal');
const portDetailCloseBtn = document.getElementById('port-detail-close');
const portDetailBackBtn = document.getElementById('port-detail-back');
const portDetailTitle = document.getElementById('port-detail-title');
const portDetailMobileTitle = document.getElementById('port-detail-mobile-title');
const portDetailCrossing = document.getElementById('port-detail-crossing');
const portDetailStatus = document.getElementById('port-detail-status');
const portDetailHours = document.getElementById('port-detail-hours');
const portDetailSummary = document.getElementById('port-detail-summary');
const portDetailLanes = document.getElementById('port-detail-lanes');
const portAlertComposer = document.getElementById('port-alert-composer');
const portAlertFormStatus = document.getElementById('port-alert-form-status');
const pushPermissionStatus = document.getElementById('push-permission-status');
const pushToast = document.getElementById('push-toast');
const pushToastTitle = document.getElementById('push-toast-title');
const pushToastBody = document.getElementById('push-toast-body');
const pushToastLink = document.getElementById('push-toast-link');
const pushToastClose = document.getElementById('push-toast-close');
let activeDetailPort = null;
let lastFocusedCard = null;

// Initialize
async function init() {
    if (favorites.length > 0) {
        currentFilter = 'fav';
        tabFav.classList.add('active');
        tabAll.classList.remove('active');
    }
    setupEventListeners();
    initializeSupabaseAlerts();
    initializePushNotifications();
    setLanguage(currentLang);
    requestUserLocation();
    await fetchData();
    startCountdown();
    updateMobileStickyState();
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

    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        if (currentSort === 'nearest' && !userLocation) {
            requestUserLocation();
        }
        render();
    });

    // Language toggle
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setLanguage(btn.dataset.lang);
        });
    });

    window.addEventListener('scroll', updateMobileStickyState, { passive: true });
    window.addEventListener('resize', () => {
        updateLastUpdatedBadge();
        updateMobileStickyState();
    });

    if (portDetailCloseBtn) {
        portDetailCloseBtn.addEventListener('click', closePortDetail);
    }
    if (portDetailBackBtn) {
        portDetailBackBtn.addEventListener('click', closePortDetail);
    }

    if (portDetailModal) {
        portDetailModal.addEventListener('click', (event) => {
            if (event.target instanceof HTMLElement && event.target.dataset.closeModal === 'true') {
                closePortDetail();
            }
        });
    }

    if (pushToastClose) {
        pushToastClose.addEventListener('click', hidePushToast);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeDetailPort) {
            closePortDetail();
        }
    });
}

function startCountdown() {
    clearInterval(refreshInterval);

    // Refresh every 5 minutes
    const refreshDelay = 5 * 60 * 1000;

    refreshInterval = setInterval(async () => {
        await fetchData();
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
            noResults.innerHTML = `<h3>${t('errorTitle')}</h3><p>${t('errorMsg')}</p>`;
        }
    }
}

function parseXML(xmlDoc) {
    const portNodes = xmlDoc.getElementsByTagName('port');
    const updateDate = xmlDoc.getElementsByTagName('last_updated_date')[0]?.textContent;
    const updateTime = xmlDoc.getElementsByTagName('last_updated_time')[0]?.textContent;

    if (updateDate && updateTime) {
        lastUpdateDate = updateDate;
        lastUpdateTime = updateTime;
        updateLastUpdatedBadge();
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
    const query = normalizeSearchValue(searchInput.value);
    const cityMatch = findMatchingCity(query);

    filteredPorts = allPorts.filter(p => {
        const matchesSearch = matchesPortSearch(p, query, cityMatch);
        const matchesTab = currentFilter === 'all' || favorites.includes(p.port_number);
        return matchesSearch && matchesTab && !isCardAllUnavailable(p);
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
    } else if (cityMatch) {
        filteredPorts.sort((a, b) => getCityDistance(a, cityMatch) - getCityDistance(b, cityMatch));
    } else {
        // alpha sort, but within regions when showing all regions
        filteredPorts.sort((a, b) => a.port_name.localeCompare(b.port_name));
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

    filteredPorts.forEach(port => grid.appendChild(renderPortCard(cardTemplate, port)));
    ensureCardGuidanceHydrated();
}

function renderPortCard(cardTemplate, port) {
    const clone = cardTemplate.content.cloneNode(true);
    const card = clone.querySelector('.port-card');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    // Title Case conversion for ALL CAPS names
    const portName = toTitleCase(port.port_name);
    const crossingName = port.crossing_name && port.crossing_name.trim() !== '' && port.crossing_name !== 'N/A'
        ? toTitleCase(port.crossing_name) : '';
    clone.querySelector('.port-name').textContent = crossingName
        ? `${portName} — ${crossingName}`
        : portName;

    const statusBadge = clone.querySelector('.port-status');
    const status = port.port_status || 'Unknown';
    statusBadge.textContent = status.toLowerCase() === 'open' ? t('statusOpen') : t('statusClosed');
    const isOpen = status.toLowerCase() === 'open';
    statusBadge.classList.add(isOpen ? 'open' : 'closed');
    card.classList.add(isOpen ? 'status-open' : 'status-closed');

    clone.querySelector('.hours-text').textContent = port.hours || '';

    const favBtn = clone.querySelector('.fav-btn');
    if (favorites.includes(port.port_number)) {
        favBtn.classList.add('active');
    }
    favBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFavorite(port.port_number, favBtn);
    });
    favBtn.addEventListener('keydown', (event) => {
        event.stopPropagation();
    });

    card.addEventListener('click', () => openPortDetail(port, card));
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPortDetail(port, card);
        }
    });

    const cardComparisons = getDailyGuidanceComparisonsForPort(port, dailyGuidanceSnapshot);
    populateLanesContainer(clone.querySelector('.lanes-container'), port, {
        comparisons: cardComparisons,
        includeNormalTrend: false,
        layout: 'card',
        showComparison: true,
        showGuidance: false,
    });

    // Dim card if ALL categories are pending/closed (#6)
    const allPending = isCardFullyPending(port);
    if (allPending) card.classList.add('card-pending');

    return clone;
}

function renderCategory(container, title, data, type, options = {}) {
    if (!data) return;
    const {
        comparisons = {},
        includeNormalTrend = true,
        layout = 'stacked',
        showComparison = false,
        showGuidance = showComparison,
    } = options;

    const categoryIcons = {
        passenger: '<svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>',
        pedestrian: '<svg viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>',
    };

    // Helper: check if lane has real renderable data (not pending/closed/NA)
    const isLaneActive = (lane) => lane && !lane.isClosedOrNA && lane.operational_status !== 'Update Pending';

    // Check if there's any active lane types with real data
    const hasRealData = isLaneActive(data.standard) ||
        isLaneActive(data.ready) || isLaneActive(data.nexus_sentri);

    // Check if there's any pending lanes
    const hasPendingLanes = ['standard', 'nexus_sentri', 'ready']
        .some(k => data[k] && data[k].operational_status === 'Update Pending');

    // #3: Hide category if no real data AND no pending data
    if (!hasRealData && !hasPendingLanes) return;

    const tpl = document.getElementById('lane-category-template').content.cloneNode(true);
    const categoryDiv = tpl.querySelector('.lane-category');
    tpl.querySelector('.category-title').textContent = title;
    tpl.querySelector('.category-icon').innerHTML = categoryIcons[type] || '';
    const typesContainer = tpl.querySelector('.lane-types');
    const laneRenderOptions = {
        includeNormalTrend,
        layout,
        showComparison,
        showGuidance,
    };

    if (layout === 'card') {
        categoryDiv.classList.add('lane-category-card');
        typesContainer.classList.add('lane-types-card');
    }

    let addedType = false;

    // Lane order: SENTRI → Ready → Standard
    if (isLaneActive(data.nexus_sentri)) addedType |= renderLaneType(typesContainer, t('sentriNexus'), data.nexus_sentri, showComparison ? comparisons[getLaneComparisonKey(type, 'nexus_sentri')] : null, laneRenderOptions);
    if (isLaneActive(data.ready)) addedType |= renderLaneType(typesContainer, t('readyLane'), data.ready, showComparison ? comparisons[getLaneComparisonKey(type, 'ready')] : null, laneRenderOptions);
    if (isLaneActive(data.standard)) addedType |= renderLaneType(typesContainer, t('standard'), data.standard, showComparison ? comparisons[getLaneComparisonKey(type, 'standard')] : null, laneRenderOptions);

    // #1: Collapse all-pending lanes into single message
    if (!addedType) {
        const allPending = ['standard', 'nexus_sentri', 'ready']
            .some(k => data[k] && data[k].operational_status === 'Update Pending');
        if (allPending) {
            typesContainer.innerHTML = `<div class="pending-message">${t('pendingUpdate')}</div>`;
        } else {
            return; // truly empty, hide category
        }
    }

    container.appendChild(categoryDiv);
}

function renderLaneType(container, name, details, comparison = null, options = {}) {
    if (!details || details.isClosedOrNA) return false;

    const {
        includeNormalTrend = true,
        layout = 'stacked',
        showComparison = false,
        showGuidance = showComparison,
    } = options;
    const tpl = document.getElementById('lane-type-template').content.cloneNode(true);
    const laneTypeEl = tpl.querySelector('.lane-type');
    const laneNameEl = tpl.querySelector('.lane-name');
    laneNameEl.textContent = name;
    const laneInfoEl = tpl.querySelector('.lane-info');
    const trendEl = tpl.querySelector('.lane-trend');
    const guidanceEl = tpl.querySelector('.lane-guidance');
    const guidanceLabelEl = tpl.querySelector('.lane-guidance-label');
    const guidanceValueEl = tpl.querySelector('.lane-guidance-value');
    const laneDetailsEl = tpl.querySelector('.lane-details');

    const badge = tpl.querySelector('.delay-badge');
    const delay = details.delay_minutes;
    const delayNum = parseInt(delay);

    if (layout === 'card') {
        laneTypeEl.classList.add('lane-type-card');
        if (showGuidance) {
            laneTypeEl.classList.add('lane-type-card-detail');
        }
        laneInfoEl.classList.add('lane-info-card');
        badge.classList.add('delay-badge-card');
        laneInfoEl.insertBefore(badge, trendEl);
    }

    if (!delay || delay === '' || isNaN(delayNum) || delayNum < 0) {
        badge.textContent = details.operational_status || 'N/A';
        badge.classList.add('na');
    } else {
        badge.textContent = delayNum === 0 ? t('noDelay') : `${delayNum} min`;
        if (layout === 'card' && delayNum === 0) {
            badge.classList.add('delay-badge-no-delay');
        }
        // #9: Smoother continuous color gradient
        badge.style.color = getDelayColor(delayNum, 1);
    }

    if (showComparison && trendEl) {
        const trend = getTrendLabel(comparison, { includeNormal: includeNormalTrend });
        if (trend) {
            trendEl.classList.remove('hidden');
            trendEl.classList.add(trend.className);

            if (layout === 'card') {
                trendEl.textContent = trend.text;

                if (trend.className === 'is-faster') {
                    badge.style.color = '#1dff5c';
                } else if (trend.className === 'is-slower') {
                    badge.style.color = '#ff3c3c';
                }
            } else {
                trendEl.textContent = trend.text;
            }
        }

        const bestHoursText = showGuidance ? formatBestHoursText(comparison) : null;
        if (bestHoursText && guidanceEl && guidanceLabelEl && guidanceValueEl) {
            guidanceLabelEl.textContent = `${t('bestHoursLabel')}:`;
            guidanceValueEl.textContent = bestHoursText;
            guidanceEl.classList.remove('hidden');
        }
    }

    if (laneDetailsEl) {
        laneDetailsEl.classList.add('hidden');
    }

    container.appendChild(tpl);
    return true;
}

function populateLanesContainer(container, port, options = {}) {
    if (!container) return;

    container.innerHTML = '';

    // Order: Vehicles -> Pedestrians
    renderCategory(container, t('passengerVehicles'), port.passenger, 'passenger', options);
    renderCategory(container, t('pedestrians'), port.pedestrian, 'pedestrian', options);

    if (container.children.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary);font-size:0.875rem;">${t('noLaneData')}</p>`;
    }
}

function updateLastUpdatedBadge() {
    if (!lastUpdatedEl || !lastUpdateDate || !lastUpdateTime) return;
    lastUpdatedEl.textContent = `${t('updated')} ${formatDateTime(lastUpdateDate, lastUpdateTime)}`;
}

function setAlertFormStatus(message, kind = 'muted') {
    if (!portAlertFormStatus) return;

    portAlertFormStatus.textContent = message || '';
    portAlertFormStatus.classList.remove('is-success', 'is-error', 'is-muted');

    if (kind === 'success') {
        portAlertFormStatus.classList.add('is-success');
    } else if (kind === 'error') {
        portAlertFormStatus.classList.add('is-error');
    } else {
        portAlertFormStatus.classList.add('is-muted');
    }
}

function getAlertDraftKey(travelMode, laneType) {
    return `${travelMode}:${laneType}`;
}

function getAlertDraftThreshold(travelMode, laneType) {
    const key = getAlertDraftKey(travelMode, laneType);
    const saved = alertThresholdDrafts[key];
    if (Number.isInteger(saved) && saved >= 0 && saved <= 600) {
        return saved;
    }
    return 60;
}

function setAlertDraftThreshold(travelMode, laneType, value) {
    const parsed = parseInt(`${value || ''}`, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 600) {
        alertThresholdDrafts[getAlertDraftKey(travelMode, laneType)] = parsed;
    }
}

function getAvailableAlertLaneEntries(port) {
    if (!port) return [];

    const groups = [
        {
            travelMode: 'passenger',
            travelLabel: t('travelPassenger'),
            source: port.passenger,
            lanes: ['nexus_sentri', 'ready', 'standard'],
        },
        {
            travelMode: 'pedestrian',
            travelLabel: t('travelPedestrian'),
            source: port.pedestrian,
            lanes: ['ready', 'standard'],
        },
    ];

    return groups.flatMap((group) =>
        group.lanes
            .filter((laneType) => isSupportedLaneType(laneType))
            .map((laneType) => ({
                travelMode: group.travelMode,
                travelLabel: group.travelLabel,
                laneType,
                laneLabel: t(ALERT_LANE_LABELS[laneType]),
                details: group.source?.[laneType] || null,
            }))
            .filter((entry) =>
                entry.details &&
                !isLaneUnavailableForCard(entry.details) &&
                entry.details.delay_minutes !== '' &&
                !Number.isNaN(parseInt(entry.details.delay_minutes, 10))
            )
    );
}

function formatAlertWaitValue(details) {
    const delayMinutes = parseInt(details?.delay_minutes || '', 10);
    if (!Number.isInteger(delayMinutes) || delayMinutes < 0) {
        return details?.operational_status || 'N/A';
    }
    return delayMinutes === 0 ? t('noDelay') : `${delayMinutes} min`;
}

function renderAlertComposer() {
    if (!portAlertComposer) return;

    const lanes = getAvailableAlertLaneEntries(activeDetailPort);

    if (lanes.length === 0) {
        portAlertComposer.innerHTML = `<p class="port-alert-empty">${t('alertsCurrentWaitMissing')}</p>`;
        return;
    }

    portAlertComposer.innerHTML = lanes.map((entry) => {
        const thresholdValue = getAlertDraftThreshold(entry.travelMode, entry.laneType);
        const activeAlerts = currentPortAlerts.filter((alert) =>
            alert.travel_mode === entry.travelMode && alert.lane_type === entry.laneType
        );
        const delayMinutes = parseInt(entry.details?.delay_minutes || '', 10);
        const waitColor = getDelayColor(Number.isInteger(delayMinutes) ? delayMinutes : 0, 1);

        return `
            <article class="lane-alert-card" data-travel-mode="${entry.travelMode}" data-lane-type="${entry.laneType}">
                <div class="lane-alert-card-header">
                    <div class="lane-alert-card-copy">
                        <p class="lane-alert-card-eyebrow">${entry.travelLabel}</p>
                        <h4 class="lane-alert-card-title">${entry.laneLabel}</h4>
                    </div>
                    <div class="lane-alert-card-wait-wrap">
                        <span class="lane-alert-card-wait-label">${t('alertsLaneCurrent')}</span>
                        <span class="lane-alert-card-wait" style="color:${waitColor}">${formatAlertWaitValue(entry.details)}</span>
                    </div>
                </div>
                <div class="lane-alert-card-controls">
                    <label class="lane-alert-card-threshold">
                        <span>${t('alertsLaneTargetLabel')}</span>
                        <div class="port-alert-threshold-wrap">
                            <input class="lane-alert-threshold-input" type="number" min="0" max="600" step="5" inputmode="numeric" value="${thresholdValue}">
                            <span class="port-alert-threshold-unit">${t('alertsMinutesUnit')}</span>
                        </div>
                    </label>
                    <button class="lane-alert-card-submit" type="button" ${supabaseReady ? '' : 'disabled'}>
                        ${t('alertsLaneSetButton')}
                    </button>
                </div>
                <div class="lane-alert-card-saved">
                    ${activeAlerts.length > 0 ? `
                        <span class="lane-alert-card-saved-label">${t('alertsLaneSavedLabel')}</span>
                        <div class="lane-alert-card-saved-list">
                            ${activeAlerts.map((alert) => `
                                <div class="lane-alert-pill">
                                    <span>&lt; ${alert.threshold_minutes} ${t('alertsMinutesUnit')}</span>
                                    <button class="lane-alert-pill-delete" type="button" data-alert-id="${alert.id}">×</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <span class="lane-alert-card-empty">${t('alertsLaneNoSaved')}</span>
                    `}
                </div>
            </article>
        `;
    }).join('');

    portAlertComposer.querySelectorAll('.lane-alert-threshold-input').forEach((input) => {
        input.addEventListener('input', () => {
            const card = input.closest('.lane-alert-card');
            if (!card) return;
            setAlertDraftThreshold(card.dataset.travelMode, card.dataset.laneType, input.value);
        });
    });

    portAlertComposer.querySelectorAll('.lane-alert-card-submit').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.closest('.lane-alert-card');
            const input = card?.querySelector('.lane-alert-threshold-input');
            if (!card || !input) return;
            void saveAlertForLane(card.dataset.travelMode, card.dataset.laneType, input.value, button);
        });
    });

    portAlertComposer.querySelectorAll('.lane-alert-pill-delete').forEach((button) => {
        button.addEventListener('click', () => {
            void deleteAlert(button.dataset.alertId);
        });
    });
}

function renderCurrentPortAlerts() {
    renderAlertComposer();
}

async function loadAlertsForPort(port) {
    if (!port) return;

    if (!supabaseReady || !supabaseClient) {
        currentPortAlerts = [];
        renderCurrentPortAlerts();
        setAlertFormStatus('');
        return;
    }

    const loadId = ++alertLoadCounter;
    currentPortAlerts = [];
    renderCurrentPortAlerts();
    setAlertFormStatus('');

    try {
        const { data, error } = await supabaseClient
            .from('wait_time_alerts')
            .select('id, travel_mode, lane_type, threshold_minutes, created_at')
            .eq('port_number', port.port_number)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (loadId !== alertLoadCounter) return;
        if (error) throw error;

        currentPortAlerts = (data || []).filter((alert) =>
            isSupportedTravelMode(alert.travel_mode) && isSupportedLaneType(alert.lane_type)
        );
        renderCurrentPortAlerts();
        setAlertFormStatus('');
    } catch (error) {
        console.error('Error loading alerts:', error);
        currentPortAlerts = [];
        renderCurrentPortAlerts();
        setAlertFormStatus(getAlertErrorMessage(error, 'load'), 'error');
    }
}

function getAlertErrorMessage(error, action) {
    if (error?.code === '42P01' || `${error?.message || ''}`.includes('wait_time_alerts')) {
        return t('alertsSchemaMissing');
    }

    return action === 'delete' ? t('alertsDeleteError') : t('alertsSaveError');
}

function getPushErrorMessage(error, action) {
    const code = `${error?.code || ''}`;
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    if (
        code === '42P01' ||
        message.includes('relation "device_subscriptions"') ||
        message.includes("relation 'device_subscriptions'") ||
        message.includes('could not find the table') ||
        message.includes('schema cache')
    ) {
        return t('pushSchemaMissing');
    }

    if (message.includes('vapid')) {
        return t('pushConfigMissing');
    }

    if (message.includes('blocked')) {
        return t('pushDenied');
    }

    if (
        code === '23505' ||
        code === '42501' ||
        message.includes('duplicate key') ||
        message.includes('row-level security') ||
        message.includes('permission denied') ||
        message.includes('device_subscriptions')
    ) {
        return t('pushBrowserLinkError');
    }

    return t('pushRegisterError');
}

function hidePushToast() {
    if (!pushToast) return;

    pushToast.hidden = true;
    if (pushToastTimer) {
        clearTimeout(pushToastTimer);
        pushToastTimer = null;
    }
}

async function showBrowserPushNotification(detail) {
    if (Notification.permission !== 'granted') {
        return;
    }

    const title = detail.title || 'Garita Watch alert';
    const body = detail.body || '';
    const link = detail.link || '/';
    const tag = detail.data?.alert_id || 'garita-watch-alert';

    if (document.visibilityState === 'visible') {
        try {
            new Notification(title, {
                body,
                icon: '/favicon.ico',
                tag,
            });
        } catch (error) {
            console.warn('Unable to display foreground browser notification:', error);
        }
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
            badge: '/favicon.ico',
            body,
            data: { link },
            icon: '/favicon.ico',
            tag,
        });
        return;
    } catch (error) {
        console.warn('Unable to display service worker notification:', error);
    }

    try {
        new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag,
        });
    } catch (error) {
        console.warn('Unable to display browser notification:', error);
    }
}

function showPushToast(detail) {
    if (!pushToast || !pushToastTitle || !pushToastBody || !pushToastLink) {
        return;
    }

    const title = detail.title || 'Garita Watch alert';
    const body = detail.body || '';
    const link = detail.link || '/';

    pushToastTitle.textContent = title;
    pushToastBody.textContent = body;
    pushToastLink.textContent = t('pushToastOpen');
    pushToastLink.href = link;

    if (pushToastTimer) {
        clearTimeout(pushToastTimer);
    }

    if (document.visibilityState === 'visible') {
        pushToast.hidden = false;
        pushToastTimer = setTimeout(() => {
            hidePushToast();
        }, 8000);
    } else {
        pushToast.hidden = true;
    }

    void showBrowserPushNotification(detail);
}

async function saveAlertForLane(travelMode, laneType, thresholdValue, triggerButton = null) {
    if (!activeDetailPort || !supabaseReady || !supabaseClient) {
        setAlertFormStatus(t('alertsWaitingForSupabase'), 'error');
        return;
    }

    const thresholdMinutes = parseInt(`${thresholdValue || ''}`, 10);

    if (!Number.isInteger(thresholdMinutes) || thresholdMinutes < 0 || thresholdMinutes > 600) {
        setAlertFormStatus(t('alertsInvalidThreshold'), 'error');
        return;
    }

    const duplicateAlert = currentPortAlerts.some((alert) =>
        alert.travel_mode === travelMode &&
        alert.lane_type === laneType &&
        alert.threshold_minutes === thresholdMinutes
    );

    if (duplicateAlert) {
        setAlertFormStatus(t('alertsDuplicate'), 'error');
        return;
    }

    setAlertDraftThreshold(travelMode, laneType, thresholdMinutes);

    if (triggerButton) {
        triggerButton.disabled = true;
    }
    setAlertFormStatus(t('alertsLoading'));

    try {
        const pushReadyForAlert = await ensurePushReadyForAlert();
        if (!pushReadyForAlert) {
            return;
        }

        const crossingName = activeDetailPort.crossing_name && activeDetailPort.crossing_name !== 'N/A'
            ? toTitleCase(activeDetailPort.crossing_name)
            : null;

        const { data, error } = await supabaseClient
            .from('wait_time_alerts')
            .insert({
                installation_id: installationId,
                port_number: activeDetailPort.port_number,
                port_name: toTitleCase(activeDetailPort.port_name),
                crossing_name: crossingName,
                travel_mode: travelMode,
                lane_type: laneType,
                operator: 'lte',
                threshold_minutes: thresholdMinutes,
            })
            .select('id, travel_mode, lane_type, threshold_minutes, created_at')
            .single();

        if (error) throw error;

        currentPortAlerts = [data, ...currentPortAlerts];
        renderCurrentPortAlerts();
        setAlertFormStatus(t('alertsSaveSuccess'), 'success');
    } catch (error) {
        console.error('Error saving alert:', error);
        setAlertFormStatus(getAlertErrorMessage(error, 'save'), 'error');
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

async function ensurePushReadyForAlert() {
    if (!window.garitaWatchPush || !pushReady || !window.garitaWatchPush.hasBrowserPushSupport()) {
        setPushStatus(t('pushUnsupported'), 'error');
        setAlertFormStatus(t('pushAlertRequired'), 'error');
        return false;
    }

    if (!window.garitaWatchPush.hasConfiguredVapidKey()) {
        setPushStatus(t('pushConfigMissing'), 'error');
        setAlertFormStatus(t('pushConfigMissing'), 'error');
        return false;
    }

    if (pushState?.registered) {
        return true;
    }

    if (pushState?.permission === 'denied') {
        setPushStatus(t('pushAlertRequired'), 'error');
        setAlertFormStatus(t('pushAlertRequired'), 'error');
        return false;
    }

    try {
        setPushStatus(t('pushRegistering'));
        await window.garitaWatchPush.requestAndRegisterPush({ locale: currentLang });
        await refreshPushState();
        setPushStatus(t('pushRegisterSuccess'), 'success');
        return Boolean(pushState?.registered);
    } catch (error) {
        console.error('Push notification setup failed during alert creation:', error);
        const message = getPushErrorMessage(error, 'register');
        setPushStatus(message, 'error');
        setAlertFormStatus(message, 'error');
        await refreshPushState();
        return false;
    }
}

async function deleteAlert(alertId) {
    if (!alertId || !supabaseReady || !supabaseClient) {
        setAlertFormStatus(t('alertsDeleteError'), 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('wait_time_alerts')
            .delete()
            .eq('id', alertId);

        if (error) throw error;

        currentPortAlerts = currentPortAlerts.filter((alert) => alert.id !== alertId);
        renderCurrentPortAlerts();
        setAlertFormStatus(t('alertsDeleteSuccess'), 'success');
    } catch (error) {
        console.error('Error deleting alert:', error);
        setAlertFormStatus(getAlertErrorMessage(error, 'delete'), 'error');
    }
}

function openPortDetail(port, cardElement) {
    if (!portDetailModal) return;

    activeDetailPort = port;
    lastFocusedCard = cardElement || document.activeElement;

    const portName = toTitleCase(port.port_name);
    const crossingName = port.crossing_name && port.crossing_name.trim() !== '' && port.crossing_name !== 'N/A'
        ? toTitleCase(port.crossing_name)
        : '';
    const status = (port.port_status || 'Closed').toLowerCase();
    const isOpen = status === 'open';

    portDetailTitle.textContent = portName;
    if (portDetailMobileTitle) {
        portDetailMobileTitle.textContent = portName;
    }
    portDetailCrossing.textContent = crossingName;
    portDetailCrossing.classList.toggle('hidden', !crossingName);
    portDetailStatus.textContent = isOpen ? t('statusOpen') : t('statusClosed');
    portDetailStatus.classList.toggle('open', isOpen);
    portDetailStatus.classList.toggle('closed', !isOpen);
    portDetailHours.textContent = port.hours || 'N/A';

    renderPortDetailSummary(port);
    void refreshPushState();
    currentPortAlerts = [];
    renderAlertComposer();
    void loadAlertsForPort(port);
    currentLaneComparisons = {};
    populateLanesContainer(portDetailLanes, port, getDetailLaneRenderOptions(currentLaneComparisons));
    void loadLaneComparisonsForPort(port);

    portDetailModal.classList.remove('hidden');
    portDetailModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    if (window.innerWidth <= 768) {
        document.body.classList.add('mobile-detail-open');
        portDetailBackBtn?.focus();
    } else {
        document.body.classList.remove('mobile-detail-open');
        portDetailCloseBtn?.focus();
    }
}

function closePortDetail() {
    if (!portDetailModal) return;

    activeDetailPort = null;
    currentPortAlerts = [];
    currentLaneComparisons = {};
    portDetailModal.classList.add('hidden');
    portDetailModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.body.classList.remove('mobile-detail-open');
    renderCurrentPortAlerts();
    if (lastFocusedCard && typeof lastFocusedCard.focus === 'function') {
        lastFocusedCard.focus();
    }
}

function renderPortDetailSummary(port) {
    if (!portDetailSummary) return;
    portDetailSummary.innerHTML = '';
    portDetailSummary.classList.add('hidden');
}

function matchesPortSearch(port, query, cityMatch) {
    if (!query) return true;

    let matchStr = normalizeSearchValue(port.port_name);
    if (port.crossing_name && port.crossing_name !== 'N/A') {
        matchStr += ` ${normalizeSearchValue(port.crossing_name)}`;
    }

    if (matchStr.includes(query)) return true;

    if (!cityMatch || !port.lat || !port.lng) return false;

    return getCityDistance(port, cityMatch) <= cityMatch.radiusKm;
}

function findMatchingCity(query) {
    if (!query) return null;

    return CITY_INDEX.find(city =>
        city.aliases.some(alias => isCityAliasMatch(query, normalizeSearchValue(alias)))
    ) || null;
}

function getCityDistance(port, city) {
    if (!port.lat || !port.lng) return Infinity;
    return haversine(city.lat, city.lng, port.lat, port.lng);
}

function normalizeSearchValue(value) {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function isCityAliasMatch(query, alias) {
    if (!query || !alias) return false;
    if (query === alias || query.includes(alias)) return true;
    if (alias.length <= 3) return alias.startsWith(query);
    return query.length >= 3 && alias.includes(query);
}

function updateMobileStickyState() {
    if (!controlsSection) return;
    const shouldCompact = window.innerWidth <= 768 && window.scrollY > 56;
    controlsSection.classList.toggle('mobile-scrolled', shouldCompact);
}

// Format date/time from XML into readable format, with a shorter mobile variant.
function formatDateTime(dateStr, timeStr) {
    try {
        const parts = dateStr.trim().split(/[-\/]/);
        // Handle both YYYY-M-D and M/D/YYYY formats
        let year, month, day;
        if (parts[0].length === 4) {
            year = parts[0]; month = parseInt(parts[1]); day = parseInt(parts[2]);
        } else {
            month = parseInt(parts[0]); day = parseInt(parts[1]); year = parts[2];
        }

        if (window.innerWidth <= 768) {
            return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

// #6: Check if all categories are pending
function isCardFullyPending(port) {
    const cats = [port.passenger, port.pedestrian];
    let hasAnyCat = false;
    for (const cat of cats) {
        if (!cat) continue;
        hasAnyCat = true;
        const lanes = [cat.standard, cat.nexus_sentri, cat.ready];
        for (const lane of lanes) {
            if (lane && !lane.isClosedOrNA && lane.operational_status !== 'Update Pending') return false;
        }
    }
    return hasAnyCat;
}

function isCardAllUnavailable(port) {
    const lanes = getPortLanes(port);
    if (lanes.length === 0) return true;
    return lanes.every(isLaneUnavailableForCard);
}

function getPortLanes(port) {
    return [port.passenger, port.pedestrian]
        .filter(Boolean)
        .flatMap(category => [category.standard, category.nexus_sentri, category.ready])
        .filter(Boolean);
}

function isLaneUnavailableForCard(lane) {
    if (!lane) return true;
    return !lane.operational_status || lane.operational_status === 'N/A' || lane.operational_status === 'Update Pending';
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

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const apartmentListContainer = document.querySelector('#apartment-list .grid');
    const loadingIndicator = document.getElementById('loading');
    const updateButton = document.getElementById('update-button');
    const updateStatus = document.getElementById('update-status');
    const filterBuildingSelect = document.getElementById('filter-building');
    const filterFloorSelect = document.getElementById('filter-floor');
    const filterStyleSelect = document.getElementById('filter-style');
    const filterUpdatedCheckbox = document.getElementById('filter-updated');
    const sortBySelect = document.getElementById('sort-by');
    const resultsCountP = document.getElementById('results-count');
    const noResultsP = document.getElementById('no-results');
    const resetButton = document.getElementById('reset-filters');

    // --- State ---
    let allApartments = []; // To store the full list fetched from the API
    // Default state - will be potentially overwritten by cookies
    let currentFilters = {
        buildings: [],
        floor: 'all',
        style: 'all',
        updatedOnly: false
    };
    let currentSort = 'name-asc'; // Default sort

    // --- Constants ---
    const API_BASE_URL = '/api/v1';
    const COOKIE_NAME = 'apartmentFilters'; // Name for the cookie
    const COOKIE_EXPIRY_DAYS = 7; // How long the cookie should last

    // --- Cookie Helper Functions ---

    /**
     * Saves the current filter and sort state to a cookie.
     */
    function saveStateToCookie() {
        const stateToSave = {
            filters: currentFilters,
            sort: currentSort
        };
        try {
            const stateString = JSON.stringify(stateToSave);
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
            document.cookie = `${COOKIE_NAME}=${encodeURIComponent(stateString)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
            // console.log("State saved to cookie:", stateToSave); // For debugging
        } catch (e) {
            console.error("Error saving state to cookie:", e);
        }
    }

    /**
     * Loads filter and sort state from the cookie.
     * @returns {object | null} The loaded state object or null if no valid cookie found.
     */
    function loadStateFromCookie() {
        try {
            const cookies = document.cookie.split('; ');
            const cookie = cookies.find(row => row.startsWith(`${COOKIE_NAME}=`));
            if (cookie) {
                const cookieValue = decodeURIComponent(cookie.split('=')[1]);
                const loadedState = JSON.parse(cookieValue);
                // Basic validation
                if (loadedState && typeof loadedState.filters === 'object' && typeof loadedState.sort === 'string') {
                     // console.log("State loaded from cookie:", loadedState); // For debugging
                    return loadedState;
                }
            }
        } catch (e) {
            console.error("Error loading state from cookie:", e);
        }
        return null; // Return null if no cookie or error
    }

    // --- Helper Functions (Building Number, Timestamp Formatting) ---

    function getBuildingNumber(name) {
        if (!name || typeof name !== 'string') return null;
        const match = name.match(/^#?(\d+)-/);
        return match ? match[1] : null;
    }

    function formatTimestamp(timestamp) {
        if (timestamp == null || typeof timestamp !== 'number' || timestamp <= 0) return 'N/A';
        try {
            const date = new Date(timestamp * 1000);
            return date.toLocaleString();
        } catch (e) {
            console.error("Error formatting timestamp:", timestamp, e);
            return 'Invalid Date';
        }
    }

    // --- Core Functions ---

    /**
     * Updates the UI elements (selects, checkbox) to match the current state.
     */
     function updateUIFromState() {
        // Restore multi-select building filter
        Array.from(filterBuildingSelect.options).forEach(option => {
            option.selected = currentFilters.buildings.includes(option.value);
        });
        // Restore single-select filters
        filterFloorSelect.value = currentFilters.floor;
        filterStyleSelect.value = currentFilters.style;
        // Restore checkbox
        filterUpdatedCheckbox.checked = currentFilters.updatedOnly;
        // Restore sort dropdown
        sortBySelect.value = currentSort;
    }


    /**
     * Populates filter dropdowns based on available data.
     */
    function populateFilters() {
        const buildings = new Set();
        const floors = new Set();
        const styles = new Set();

        allApartments.forEach(apt => {
            const buildingNum = getBuildingNumber(apt.name);
            if (buildingNum) buildings.add(buildingNum);
            if (apt.floor) floors.add(apt.floor);
            styles.add(apt.style || 'N/A');
        });

        // Clear existing options (except for 'All' placeholders where applicable)
        filterBuildingSelect.innerHTML = '';
        filterFloorSelect.innerHTML = '<option value="all">All Floors</option>';
        filterStyleSelect.innerHTML = '<option value="all">All Styles</option>';
        if (!styles.has('N/A')) {
             styles.add('N/A');
        }

        // Populate Building Filter
        Array.from(buildings).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(building => {
            const option = document.createElement('option');
            option.value = building;
            option.textContent = `Building ${building}`;
            // DO NOT set selected here - rely on updateUIFromState after loading cookies
            filterBuildingSelect.appendChild(option);
        });

        // Populate Floor Filter
        const sortedFloors = Array.from(floors).sort((a, b) => {
            const floorOrder = { "First Floor": 1, "Second Floor": 2, "Third Floor": 3 };
            return (floorOrder[a] || 99) - (floorOrder[b] || 99);
        });
        sortedFloors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor;
            option.textContent = floor;
            filterFloorSelect.appendChild(option);
        });

        // Populate Style Filter
        Array.from(styles).sort().forEach(style => {
            const option = document.createElement('option');
            option.value = style;
            option.textContent = style;
            filterStyleSelect.appendChild(option);
        });

        // After populating, update the UI to reflect the current state (which might have been loaded from cookies)
        updateUIFromState();
    }

    /**
     * Renders the apartment list based on filtered and sorted data.
     * @param {Array} apartmentsToDisplay - The array of apartment objects to render.
     */
    function renderApartmentList(apartmentsToDisplay) {
        if (!apartmentListContainer) {
            console.error("Apartment list container not found!");
            return;
        }

        apartmentListContainer.innerHTML = '';
        noResultsP.classList.add('hidden');

        if (apartmentsToDisplay.length === 0) {
            resultsCountP.textContent = '0 apartments found.';
            noResultsP.classList.remove('hidden');
            return;
        }

        resultsCountP.textContent = `${apartmentsToDisplay.length} apartment${apartmentsToDisplay.length !== 1 ? 's' : ''} found.`;

        apartmentsToDisplay.forEach(apt => {
            const card = document.createElement('div');
            card.className = 'apartment-card';

            const isUpdated = apt.updated_at && apt.created_at && apt.updated_at > apt.created_at;
            const updatedBadgeHtml = isUpdated ? '<span class="updated-badge">Updated</span>' : '';

            let detailsListHtml = '';
            if (Array.isArray(apt.details) && apt.details.length > 0) {
                detailsListHtml = `<ul class="list-disc list-inside text-sm text-gray-600 mt-1">${apt.details.map(d => `<li>${d || 'N/A'}</li>`).join('')}</ul>`;
            } else {
                detailsListHtml = '<p class="text-sm text-gray-500 mt-1">No specific details.</p>';
            }

            card.innerHTML = `
                ${updatedBadgeHtml}
                <div>
                    <h3 class="font-semibold text-lg text-gray-800">${apt.name || 'N/A'}</h3>
                    <p class="text-gray-700">Price: <span class="font-medium">$${apt.price?.toLocaleString() ?? 'N/A'}</span></p>
                    <p class="text-gray-600 text-sm">Floor: ${apt.floor || 'N/A'}</p>
                    <p class="text-gray-600 text-sm">Style: ${apt.style || 'N/A'}</p>
                    ${detailsListHtml}
                    <p class="text-xs text-gray-500 mt-2">Last Updated: ${formatTimestamp(apt.updated_at)}</p>
                </div>
                <a href="${apt.page_url || '#'}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 text-sm inline-block mt-2">View Details</a>
            `;
            apartmentListContainer.appendChild(card);
        });
    }

    /**
     * Applies current filters and sorting to the apartment list.
     */
    function applyFiltersAndSorting() {
        // 1. Filter
        let filteredApartments = allApartments.filter(apt => {
            const buildingNum = getBuildingNumber(apt.name);
            const buildingMatch = currentFilters.buildings.length === 0 || (buildingNum && currentFilters.buildings.includes(buildingNum));
            const floorMatch = currentFilters.floor === 'all' || apt.floor === currentFilters.floor;
            const styleMatch = currentFilters.style === 'all' || (apt.style ? apt.style === currentFilters.style : currentFilters.style === 'N/A');
            const updatedMatch = !currentFilters.updatedOnly || (apt.updated_at && apt.created_at && apt.updated_at > apt.created_at);
            return buildingMatch && floorMatch && styleMatch && updatedMatch;
        });

        // 2. Sort
        const [sortKey, sortOrder] = currentSort.split('-');
        filteredApartments.sort((a, b) => {
            let valA, valB;
            switch (sortKey) {
                case 'price': valA = a.price; valB = b.price; break;
                case 'floor':
                    const floorOrder = { "First Floor": 1, "Second Floor": 2, "Third Floor": 3 };
                    valA = floorOrder[a.floor] || 99; valB = floorOrder[b.floor] || 99; break;
                case 'updated': valA = a.updated_at; valB = b.updated_at; break;
                case 'name': default:
                    valA = a.name?.match(/\d+/g)?.map(Number) || [a.name];
                    valB = b.name?.match(/\d+/g)?.map(Number) || [b.name];
                    for (let i = 0; i < Math.max(valA.length, valB.length); i++) {
                        const numA = typeof valA[i] === 'number' ? valA[i] : Infinity;
                        const numB = typeof valB[i] === 'number' ? valB[i] : Infinity;
                        if (numA !== numB) return sortOrder === 'asc' ? numA - numB : numB - numA;
                        const strA = String(a.name); const strB = String(b.name);
                        if (strA !== strB) return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
                    } return 0;
            }
            if (valA == null && valB == null) return 0;
            if (valA == null) return sortOrder === 'asc' ? 1 : -1;
            if (valB == null) return sortOrder === 'asc' ? -1 : 1;
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // 3. Render
        renderApartmentList(filteredApartments);
        // 4. Save state AFTER applying changes
        saveStateToCookie();
    }


    /**
     * Fetches apartment data from the API.
     */
    async function fetchApartments() {
        loadingIndicator.style.display = 'block';
        apartmentListContainer.innerHTML = '';
        resultsCountP.textContent = '';
        noResultsP.classList.add('hidden');
        updateStatus.textContent = 'Fetching data...';
        [updateButton, filterBuildingSelect, filterFloorSelect, filterStyleSelect, filterUpdatedCheckbox, sortBySelect, resetButton].forEach(el => el.disabled = true);

        try {
            const response = await fetch(`${API_BASE_URL}/apartments`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error("Invalid data format received from API.");

            allApartments = data.map(apt => ({
                ...apt,
                details: Array.isArray(apt.details) ? apt.details : [],
                created_at: Number(apt.created_at) || null,
                updated_at: Number(apt.updated_at) || null
            }));

            loadingIndicator.style.display = 'none';

            if (allApartments.length === 0) {
                updateStatus.textContent = 'No apartments available.';
                resultsCountP.textContent = '0 apartments found.';
                noResultsP.classList.remove('hidden');
            } else {
                updateStatus.textContent = `Data loaded.`;
                populateFilters(); // Populates filters AND updates UI from state
                applyFiltersAndSorting(); // Apply state (loaded from cookie or default)
            }
            console.log("Apartment data loaded.");

        } catch (error) {
            console.error('Error fetching apartment data:', error);
            loadingIndicator.style.display = 'none';
            apartmentListContainer.innerHTML = `<p class="text-center text-red-500 p-4 col-span-full">Error loading apartment data. Check console for details.</p>`;
            updateStatus.textContent = 'Error loading data.';
            resultsCountP.textContent = '';
        } finally {
            [updateButton, filterBuildingSelect, filterFloorSelect, filterStyleSelect, filterUpdatedCheckbox, sortBySelect, resetButton].forEach(el => el.disabled = false);
        }
    }

    /**
     * Handles the manual update trigger button click.
     */
    async function handleUpdateClick() {
        updateStatus.textContent = 'Initiating update...';
        updateButton.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/update`, { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            updateStatus.textContent = 'Update started. Refreshing data in 5 seconds...';
            setTimeout(fetchApartments, 5000);
        } catch (error) {
            console.error('Error triggering update:', error);
            updateStatus.textContent = `Update failed: ${error.message}`;
            updateButton.disabled = false;
        }
    }

    // --- Event Listeners ---

    filterBuildingSelect.addEventListener('change', (e) => {
        currentFilters.buildings = Array.from(e.target.selectedOptions).map(option => option.value);
        applyFiltersAndSorting(); // This will also save to cookie
    });

    filterFloorSelect.addEventListener('change', (e) => {
        currentFilters.floor = e.target.value;
        applyFiltersAndSorting(); // This will also save to cookie
    });

    filterStyleSelect.addEventListener('change', (e) => {
        currentFilters.style = e.target.value;
        applyFiltersAndSorting(); // This will also save to cookie
    });

    filterUpdatedCheckbox.addEventListener('change', (e) => {
        currentFilters.updatedOnly = e.target.checked;
        applyFiltersAndSorting(); // This will also save to cookie
    });

    sortBySelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSorting(); // This will also save to cookie
    });

    if (updateButton) {
        updateButton.addEventListener('click', handleUpdateClick);
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // Reset state to defaults
            currentFilters = { buildings: [], floor: 'all', style: 'all', updatedOnly: false };
            currentSort = 'name-asc';

            // Update UI elements to reflect defaults
            updateUIFromState();

            // Re-apply filters and sorting (this also saves the reset state to cookie)
            applyFiltersAndSorting();
            updateStatus.textContent = 'Filters reset.';
        });
    }

    // --- Initial Load ---
    const loadedState = loadStateFromCookie();
    if (loadedState) {
        // Apply loaded state if valid
        currentFilters = loadedState.filters;
        currentSort = loadedState.sort;
        // Ensure loaded filters are valid types
        currentFilters.buildings = Array.isArray(currentFilters.buildings) ? currentFilters.buildings : [];
        currentFilters.floor = typeof currentFilters.floor === 'string' ? currentFilters.floor : 'all';
        currentFilters.style = typeof currentFilters.style === 'string' ? currentFilters.style : 'all';
        currentFilters.updatedOnly = typeof currentFilters.updatedOnly === 'boolean' ? currentFilters.updatedOnly : false;
        currentSort = typeof currentSort === 'string' ? currentSort : 'name-asc';
    }
    // Fetch data - this will then populate filters and apply the current (potentially loaded) state
    fetchApartments();

});

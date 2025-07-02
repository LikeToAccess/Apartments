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
    const toggleMapButton = document.getElementById('toggle-map-button');
    const mapDisplayContainer = document.getElementById('map-display-container');
    const MAP_IMAGE_FILENAME = 'static/apartment.png';

    // Deleted section elements
    const deletedSection = document.getElementById('deleted-apartments-section');
    const deletedToggle = document.getElementById('deleted-apartments-toggle');
    const deletedListContainer = document.getElementById('deleted-apartment-list-container');
    const deletedList = document.getElementById('deleted-apartment-list');
    const deletedResultsCountP = document.getElementById('deleted-results-count');

    // --- State ---
    let allApartments = [];
    let allDeletedApartments = [];
    let currentFilteredApartments = [];
    let currentFilteredDeletedApartments = [];
    let mapVisible = false;
    let mapImageElement = null;
    let mapImageNaturalWidth = 0;
    let currentFilters = { buildings: [], floors: [], style: 'all', updatedOnly: false };
    let currentSort = 'name-asc';
    let mapPointPopover = null;
    let pinnedApartmentForPopover = null;
    const API_BASE_URL = '/api/v1';

    // --- Helper & Popover Functions ---
    function getBuildingNumber(name) { const match = name?.match(/^#?(\d+)-/); return match ? match[1] : null; }
    function formatTimestamp(timestamp) { if (!timestamp) return 'N/A'; return new Date(timestamp * 1000).toLocaleString(); }
    function createMapPopover() { if (!mapDisplayContainer) return; mapPointPopover = document.createElement('div'); mapPointPopover.className = 'map-point-popover'; mapPointPopover.style.display = 'none'; mapDisplayContainer.appendChild(mapPointPopover); }
    function updatePopoverContent(apartment) {
		if (!mapPointPopover || !apartment) return;
        // MODIFIED: Restored correct badge logic
		const isUpdated = apartment.created_at && apartment.updated_at && (apartment.updated_at > apartment.created_at);
		const updatedBadgeHtml = isUpdated && !apartment.deleted_at ? '<span class="popover-updated-badge">Updated</span>' : '';
		const isDeleted = !!apartment.deleted_at;
		const priceStyle = isDeleted ? 'text-decoration: line-through;' : '';
        const titleClass = isDeleted ? 'text-gray-500' : 'popover-title';
		mapPointPopover.innerHTML = `
            ${updatedBadgeHtml}
            <h4 class="${titleClass}">${apartment.name || 'N/A'}</h4>
            <p class="popover-detail">Price: <span style="${priceStyle}">$${apartment.price?.toLocaleString() ?? 'N/A'}</span></p>
            <p class="popover-detail">Floor: <span>${apartment.floor || 'N/A'}</span></p>
            <p class="popover-detail">Style: <span>${apartment.style || 'N/A'}</span></p>
            ${isDeleted ? `<p class="popover-detail">Unavailable since: ${new Date(apartment.deleted_at * 1000).toLocaleDateString()}</p>` : `<a href="${apartment.page_url || '#'}" target="_blank" rel="noopener noreferrer" class="popover-link">View Details</a>`}
        `;
	}
    function positionPopover(pointElement) { if (!mapPointPopover || !pointElement) return; const containerRect = mapDisplayContainer.getBoundingClientRect(); const pointRect = pointElement.getBoundingClientRect(); mapPointPopover.style.display = 'block'; const popoverRect = mapPointPopover.getBoundingClientRect(); mapPointPopover.style.display = 'none'; const pointCenterX = pointRect.left - containerRect.left + pointRect.width / 2; const pointCenterY = pointRect.top - containerRect.top + pointRect.height / 2; let popoverLeft, positionClass; const spaceNeeded = popoverRect.width + 20; if (pointCenterX + spaceNeeded <= containerRect.width) { popoverLeft = pointCenterX + 7; positionClass = 'popover-right'; } else { popoverLeft = pointCenterX - popoverRect.width - 20; positionClass = 'popover-left'; } let popoverTop = pointCenterY - popoverRect.height / 2; if (popoverTop < 5) popoverTop = 5; else if (popoverTop + popoverRect.height > containerRect.height - 5) popoverTop = containerRect.height - popoverRect.height - 5; mapPointPopover.style.top = `${popoverTop}px`; mapPointPopover.style.left = `${popoverLeft}px`; mapPointPopover.classList.remove('popover-left', 'popover-right'); mapPointPopover.classList.add(positionClass); }
    function showMapPopover(apartment, pointElement) { if (pinnedApartmentForPopover && pinnedApartmentForPopover.name !== apartment.name) return; updatePopoverContent(apartment); positionPopover(pointElement); mapPointPopover.style.display = 'block'; }
    function hideMapPopover() { if (pinnedApartmentForPopover) return; if (mapPointPopover) mapPointPopover.style.display = 'none'; }
    function togglePinnedPopover(apartment, pointElement) { const previouslyPinnedElement = mapDisplayContainer.querySelector('.location-point-pinned'); if (pinnedApartmentForPopover?.name === apartment.name) { pinnedApartmentForPopover = null; mapPointPopover.style.display = 'none'; pointElement.classList.remove('location-point-pinned'); } else { if(previouslyPinnedElement) previouslyPinnedElement.classList.remove('location-point-pinned'); pinnedApartmentForPopover = apartment; updatePopoverContent(apartment); positionPopover(pointElement); mapPointPopover.style.display = 'block'; pointElement.classList.add('location-point-pinned'); } }

    // --- Core Rendering & Filtering Functions ---
	function populateFilters() {
		const buildings = new Set(), floors = new Set(), styles = new Set();
		[...allApartments, ...allDeletedApartments].forEach(apt => {
			if (getBuildingNumber(apt.name)) buildings.add(getBuildingNumber(apt.name));
			if (apt.floor) floors.add(apt.floor);
			if (apt.style) styles.add(apt.style);
		});
		if(filterBuildingSelect) { filterBuildingSelect.innerHTML = ''; Array.from(buildings).sort((a,b)=>a-b).forEach(b => { const opt = document.createElement('option'); opt.value = b; opt.textContent = `Building ${b}`; filterBuildingSelect.appendChild(opt); }); }
		if(filterFloorSelect) { filterFloorSelect.innerHTML = ''; Array.from(floors).sort((a, b) => ({"First Floor":1,"Second Floor":2,"Third Floor":3}[a]||99)-({"First Floor":1,"Second Floor":2,"Third Floor":3}[b]||99)).forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.textContent = f; filterFloorSelect.appendChild(opt); }); }
		if(filterStyleSelect) { filterStyleSelect.innerHTML = '<option value="all">All Styles</option>'; Array.from(styles).sort().forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; filterStyleSelect.appendChild(opt); }); }
	}

    function renderApartmentList(apartmentsToDisplay) {
        if (!apartmentListContainer) return;
        apartmentListContainer.innerHTML = '';
        noResultsP.classList.add('hidden');
        if (apartmentsToDisplay.length === 0) {
            resultsCountP.textContent = '0 available apartments found.';
            if (allApartments.length > 0) noResultsP.classList.remove('hidden');
            return;
        }
        resultsCountP.textContent = `${apartmentsToDisplay.length} available apartment${apartmentsToDisplay.length > 1 ? 's' : ''} found.`;
        apartmentsToDisplay.forEach(apt => {
            const card = document.createElement('div');
            card.className = 'apartment-card';
            const isUpdated = apt.updated_at > apt.created_at;
            const detailsListHtml = Array.isArray(apt.details) && apt.details.length > 0
                ? `<ul class="list-disc list-inside text-sm text-gray-600 mt-1">${apt.details.map(d => `<li>${d || 'N/A'}</li>`).join('')}</ul>`
                : '<p class="text-sm text-gray-500 mt-1">No specific details.</p>';
            card.innerHTML = `
                ${isUpdated ? '<span class="updated-badge">Updated</span>' : ''}
                <div>
                    <h3 class="font-semibold text-lg text-gray-800">${apt.name || 'N/A'}</h3>
                    <p class="text-gray-700">Price: <span class="font-medium">$${apt.price?.toLocaleString() ?? 'N/A'}</span></p>
                    <p class="text-gray-600 text-sm">Floor: ${apt.floor || 'N/A'}</p>
                    <p class="text-gray-600 text-sm">Style: ${apt.style || 'N/A'}</p>
                    ${detailsListHtml}
                    <p class="text-xs text-gray-500 mt-2">Last Updated: ${formatTimestamp(apt.updated_at)}</p>
                </div>
                <a href="${apt.page_url || '#'}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 text-sm inline-block mt-2">View Details</a>`;
            apartmentListContainer.appendChild(card);
        });
    }

    function renderDeletedApartmentList(apartmentsToDisplay) {
        if (!deletedList || !deletedSection) return;
        if (allDeletedApartments.length === 0) {
            deletedSection.style.display = 'none';
            return;
        }
        deletedSection.style.display = 'block';
        deletedList.innerHTML = '';
        deletedResultsCountP.textContent = `${apartmentsToDisplay.length} of ${allDeletedApartments.length} previously available listing(s) shown.`;
        if (apartmentsToDisplay.length === 0) {
            deletedList.innerHTML = `<p class="text-center text-gray-500 py-6 col-span-full">No previously available listings match the current filters.</p>`;
        } else {
            apartmentsToDisplay.forEach(apt => {
                const card = document.createElement('div');
                card.className = 'apartment-card deleted-apartment-card';
                card.innerHTML = `
                    <div>
                        <h3 class="font-semibold text-lg">${apt.name || 'N/A'}</h3>
                        <p class="text-gray-700" style="text-decoration: line-through;">Price: $${apt.price?.toLocaleString() ?? 'N/A'}</p>
                        <p class="text-gray-600 text-sm">Floor: ${apt.floor || 'N/A'}</p>
                        <p class="text-gray-600 text-sm">Style: ${apt.style || 'N/A'}</p>
                        <p class="text-xs text-gray-500 mt-2">Unavailable Since: ${formatTimestamp(apt.deleted_at)}</p>
                    </div>
                    <a href="#" class="text-sm inline-block mt-2">Details Unavailable</a>`;
                deletedList.appendChild(card);
            });
        }
    }

    function applyFiltersAndSorting() {
        currentFilteredApartments = allApartments.filter(apt => {
            const buildingNum = getBuildingNumber(apt.name);
            return (currentFilters.buildings.length === 0 || (buildingNum && currentFilters.buildings.includes(buildingNum))) &&
                   (currentFilters.floors.length === 0 || (apt.floor && currentFilters.floors.includes(apt.floor))) &&
                   (currentFilters.style === 'all' || apt.style === currentFilters.style) &&
                   (!currentFilters.updatedOnly || apt.updated_at > apt.created_at);
        });
        currentFilteredDeletedApartments = allDeletedApartments.filter(apt => {
            const buildingNum = getBuildingNumber(apt.name);
            return (currentFilters.buildings.length === 0 || (buildingNum && currentFilters.buildings.includes(buildingNum))) &&
                   (currentFilters.floors.length === 0 || (apt.floor && currentFilters.floors.includes(apt.floor))) &&
                   (currentFilters.style === 'all' || apt.style === currentFilters.style);
        });
        const [sortKey, sortOrder] = currentSort.split('-');
        currentFilteredApartments.sort((a, b) => {
            let valA, valB;
            switch(sortKey) {
                case 'price': valA = a.price; valB = b.price; break;
                case 'floor': const order={"First Floor":1,"Second Floor":2,"Third Floor":3}; valA=order[a.floor]||99; valB=order[b.floor]||99; break;
                case 'updated': valA = a.updated_at; valB = b.updated_at; break;
                default: valA = a.name; valB = b.name; break;
            }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        renderApartmentList(currentFilteredApartments);
        renderDeletedApartmentList(currentFilteredDeletedApartments);
        renderMapPoints();
    }

    // --- Map Functions ---
    function setupMapContainer() {
        if (!mapDisplayContainer) return;
        const existingImg = mapDisplayContainer.querySelector('img');
        const setImgProperties = (imgElement) => { mapImageNaturalWidth = imgElement.naturalWidth; if (mapVisible) renderMapPoints(); };
        if (existingImg) { mapImageElement = existingImg; if (mapImageElement.complete) setImgProperties(mapImageElement); else mapImageElement.onload = () => setImgProperties(mapImageElement); return; }
        mapImageElement = document.createElement('img');
        mapImageElement.src = MAP_IMAGE_FILENAME;
        mapImageElement.alt = "Apartment Map";
        mapImageElement.onload = () => setImgProperties(mapImageElement);
        mapImageElement.onerror = () => { mapDisplayContainer.innerHTML = '<p class="text-center text-red-500 p-4">Map image not found.</p>'; };
        mapDisplayContainer.appendChild(mapImageElement);
    }
    function toggleMap() {
        mapVisible = !mapVisible;
        mapDisplayContainer.style.display = mapVisible ? 'block' : 'none';
        toggleMapButton.textContent = mapVisible ? 'Hide Map' : 'Show Map';
        if (mapVisible) renderMapPoints();
        else { if (mapPointPopover) mapPointPopover.style.display = 'none'; pinnedApartmentForPopover = null; }
    }
    function renderMapPoints() {
        mapDisplayContainer?.querySelectorAll('.location-point').forEach(p => p.remove());
        if (!mapVisible || !mapImageElement || !mapImageNaturalWidth) return;
        const allPointsData = [...currentFilteredApartments, ...currentFilteredDeletedApartments];
        allPointsData.forEach(apt => {
            if (!apt.coordinates) return;
            const [x, y] = apt.coordinates;
            const point = document.createElement('div');
            point.className = 'location-point';
            point.apartmentData = apt;
            if (apt.deleted_at) point.classList.add('location-point-deleted');
            point.style.left = `${(x / 100) * mapImageElement.offsetWidth}px`;
            point.style.top = `${(y / 100) * mapImageElement.offsetHeight}px`;
            point.addEventListener('mouseenter', () => showMapPopover(apt, point));
            point.addEventListener('mouseleave', () => hideMapPopover());
            point.addEventListener('click', () => togglePinnedPopover(apt, point));
            mapDisplayContainer.appendChild(point);
        });
        if (pinnedApartmentForPopover) {
            const stillVisiblePoint = Array.from(mapDisplayContainer.querySelectorAll('.location-point')).find(p => p.apartmentData.name === pinnedApartmentForPopover.name);
            if (stillVisiblePoint) positionPopover(stillVisiblePoint);
            else { mapPointPopover.style.display = 'none'; pinnedApartmentForPopover = null; }
        }
    }

    // --- Event Handlers & Initial Load ---
    async function initialDataLoad() {
        loadingIndicator.style.display = 'block';
        updateStatus.textContent = 'Fetching data...';
        document.querySelectorAll('button, select').forEach(el => el.disabled = true);
        try {
            const [apts, deletedApts] = await Promise.all([
                fetch(`${API_BASE_URL}/apartments`).then(res => res.json()),
                fetch(`${API_BASE_URL}/apartments/deleted`).then(res => res.json())
            ]);
            if (!Array.isArray(apts) || !Array.isArray(deletedApts)) throw new Error("Invalid API response.");
            allApartments = apts;
            allDeletedApartments = deletedApts;
            updateStatus.textContent = 'Data loaded.';
            populateFilters();
            applyFiltersAndSorting();
        } catch (error) {
            updateStatus.textContent = 'Error loading data.';
            console.error("Data load error:", error);
        } finally {
            loadingIndicator.style.display = 'none';
            document.querySelectorAll('button, select').forEach(el => el.disabled = false);
            setupMapContainer();
            createMapPopover();
        }
    }
    if(filterBuildingSelect) filterBuildingSelect.addEventListener('change', (e) => { currentFilters.buildings = Array.from(e.target.selectedOptions, opt => opt.value); applyFiltersAndSorting(); });
    if(filterFloorSelect) filterFloorSelect.addEventListener('change', (e) => { currentFilters.floors = Array.from(e.target.selectedOptions, opt => opt.value); applyFiltersAndSorting(); });
    if(filterStyleSelect) filterStyleSelect.addEventListener('change', (e) => { currentFilters.style = e.target.value; applyFiltersAndSorting(); });
    if(filterUpdatedCheckbox) filterUpdatedCheckbox.addEventListener('change', (e) => { currentFilters.updatedOnly = e.target.checked; applyFiltersAndSorting(); });
    if(sortBySelect) sortBySelect.addEventListener('change', (e) => { currentSort = e.target.value; applyFiltersAndSorting(); });
    if(updateButton) updateButton.addEventListener('click', async () => {
        updateStatus.textContent = 'Initiating update...';
        updateButton.disabled = true;
        try {
            await fetch(`${API_BASE_URL}/update`, { method: 'POST' });
            updateStatus.textContent = 'Update started. Refreshing in 5s...';
            setTimeout(initialDataLoad, 5000);
        } catch (error) {
            updateStatus.textContent = `Update failed.`;
            updateButton.disabled = false;
        }
    });
    if(resetButton) resetButton.addEventListener('click', () => {
        currentFilters = { buildings: [], floors: [], style: 'all', updatedOnly: false };
        currentSort = 'name-asc';
        document.querySelectorAll('select, input[type="checkbox"]').forEach(el => { if (el.type === 'checkbox') el.checked = false; else { el.selectedIndex = 0; Array.from(el.options).forEach(o => o.selected = false); } });
        applyFiltersAndSorting();
    });
    if(toggleMapButton) toggleMapButton.addEventListener('click', toggleMap);
    if(deletedToggle) deletedToggle.addEventListener('click', () => {
        deletedListContainer.classList.toggle('hidden');
        deletedToggle.classList.toggle('open');
    });
    window.addEventListener('resize', () => { if (mapVisible) renderMapPoints(); });
    // MODIFIED: Added event listener to close popover on map background click
    if (mapDisplayContainer) {
        mapDisplayContainer.addEventListener('click', (e) => {
            if (e.target === mapDisplayContainer || e.target === mapImageElement) {
                if (pinnedApartmentForPopover) {
                    const previouslyPinnedElement = mapDisplayContainer.querySelector('.location-point-pinned');
                    if (previouslyPinnedElement) {
                        previouslyPinnedElement.classList.remove('location-point-pinned');
                    }
                    pinnedApartmentForPopover = null;
                    if (mapPointPopover) {
                        mapPointPopover.style.display = 'none';
                    }
                }
            }
        });
    }

    initialDataLoad();
});

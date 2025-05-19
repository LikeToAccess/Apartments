document.addEventListener('DOMContentLoaded', () => {
	// --- DOM Elements ---
	const apartmentListContainer = document.querySelector('#apartment-list .grid');
	const loadingIndicator = document.getElementById('loading');
	const updateButton = document.getElementById('update-button');
	const updateStatus = document.getElementById('update-status');
	const filterBuildingSelect = document.getElementById('filter-building');
	const filterFloorSelect = document.getElementById('filter-floor'); // Will need 'multiple' attribute in HTML
	const filterStyleSelect = document.getElementById('filter-style');
	const filterUpdatedCheckbox = document.getElementById('filter-updated');
	const sortBySelect = document.getElementById('sort-by');
	const resultsCountP = document.getElementById('results-count');
	const noResultsP = document.getElementById('no-results');
	const resetButton = document.getElementById('reset-filters');
	const toggleMapButton = document.getElementById('toggle-map-button');
	const mapDisplayContainer = document.getElementById('map-display-container');
	const MAP_IMAGE_FILENAME = 'static/apartment.png';

	// --- State ---
	let allApartments = [];
	let mapVisible = false;
	let currentFilteredApartments = [];
	let mapImageElement = null;
	let mapImageNaturalWidth = 0;
	let mapImageNaturalHeight = 0;
	// Update currentFilters to use 'floors' array instead of 'floor' string
	let currentFilters = { buildings: [], floors: [], style: 'all', updatedOnly: false };
	let currentSort = 'name-asc';

	// --- Popover State ---
	let mapPointPopover = null;
	let pinnedApartmentForPopover = null;
	const POPOVER_OFFSET = 7;
	const POPOVER_ARROW_MARGIN = 20;

	// --- Constants ---
	const API_BASE_URL = '/api/v1';
	const COOKIE_NAME = 'apartmentFilters';
	const COOKIE_EXPIRY_DAYS = 7;

	// --- Cookie Helper Functions --- (No changes needed here, structure is the same)
	function saveStateToCookie() {
		const stateToSave = { filters: currentFilters, sort: currentSort };
		try {
			const stateString = JSON.stringify(stateToSave);
			const expiryDate = new Date();
			expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
			document.cookie = `${COOKIE_NAME}=${encodeURIComponent(stateString)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
		} catch (e) { console.error("Error saving state to cookie:", e); }
	}
	function loadStateFromCookie() {
		try {
			const cookies = document.cookie.split('; ');
			const cookie = cookies.find(row => row.startsWith(`${COOKIE_NAME}=`));
			if (cookie) {
				const cookieValue = decodeURIComponent(cookie.split('=')[1]);
				const loadedState = JSON.parse(cookieValue);
				// Validate loaded state structure, including the new 'floors' array
				if (loadedState && typeof loadedState.filters === 'object' && typeof loadedState.sort === 'string') {
					 // Ensure filter properties exist and have correct types
					 loadedState.filters.buildings = Array.isArray(loadedState.filters.buildings) ? loadedState.filters.buildings : [];
					 loadedState.filters.floors = Array.isArray(loadedState.filters.floors) ? loadedState.filters.floors : []; // Expect floors array
					 loadedState.filters.style = typeof loadedState.filters.style === 'string' ? loadedState.filters.style : 'all';
					 loadedState.filters.updatedOnly = typeof loadedState.filters.updatedOnly === 'boolean' ? loadedState.filters.updatedOnly : false;
					return loadedState;
				}
			}
		} catch (e) { console.error("Error loading state from cookie:", e); }
		return null; // Return null if cookie doesn't exist or is invalid
	}

	// --- Helper Functions --- (No changes)
	function getBuildingNumber(name) { if (!name || typeof name !== 'string') return null; const match = name.match(/^#?(\d+)-/); return match ? match[1] : null; }
	function formatTimestamp(timestamp) { if (timestamp == null || typeof timestamp !== 'number' || timestamp <= 0) return 'N/A'; try { const date = new Date(timestamp * 1000); return date.toLocaleString(); } catch (e) { console.error("Error formatting timestamp:", timestamp, e); return 'Invalid Date'; } }
	function debounce(func, wait) { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };

	// --- Popover Functions --- (No changes)
	function createMapPopover() {
		if (!mapDisplayContainer) return;
		mapPointPopover = document.createElement('div');
		mapPointPopover.className = 'map-point-popover';
		mapPointPopover.style.display = 'none';
		mapDisplayContainer.appendChild(mapPointPopover);
	}
	function updatePopoverContent(apartment) {
		if (!mapPointPopover || !apartment) return;
		const isUpdated = apartment.updated_at && apartment.created_at && apartment.updated_at > apartment.created_at;
		const updatedBadgeHtml = isUpdated ? '<span class="popover-updated-badge">Updated</span>' : '';
		mapPointPopover.innerHTML = `
			${updatedBadgeHtml}
			<h4 class="popover-title">${apartment.name || 'N/A'}</h4>
			<p class="popover-detail">Price: <span>$${apartment.price?.toLocaleString() ?? 'N/A'}</span></p>
			<p class="popover-detail">Floor: ${apartment.floor || 'N/A'}</p>
			<p class="popover-detail">Style: ${apartment.style || 'N/A'}</p>
			<a href="${apartment.page_url || '#'}" target="_blank" rel="noopener noreferrer" class="popover-link">View Details</a>
		`;
	}
	function positionPopover(pointElement) {
		if (!mapPointPopover || !pointElement || !mapImageElement || !mapDisplayContainer) return;
		const containerRect = mapDisplayContainer.getBoundingClientRect();
		const pointRect = pointElement.getBoundingClientRect();
		mapPointPopover.style.display = 'block';
		const popoverRect = mapPointPopover.getBoundingClientRect();
		mapPointPopover.style.display = 'none';
		const pointCenterX = pointRect.left - containerRect.left + pointRect.width / 2;
		const pointCenterY = pointRect.top - containerRect.top + pointRect.height / 2;
		let popoverLeft;
		let positionClass;
		const spaceNeeded = popoverRect.width + POPOVER_OFFSET + POPOVER_ARROW_MARGIN;
		if (pointCenterX + spaceNeeded <= containerRect.width) {
			popoverLeft = pointCenterX + POPOVER_OFFSET;
			positionClass = 'popover-right';
		} else if (pointCenterX - spaceNeeded >= 0) {
			popoverLeft = pointCenterX - popoverRect.width - POPOVER_OFFSET - POPOVER_ARROW_MARGIN;
			positionClass = 'popover-left';
		} else {
			popoverLeft = pointCenterX + POPOVER_OFFSET;
			positionClass = 'popover-right';
			console.warn("Popover might overflow container horizontally.");
		}
		let popoverTop = pointCenterY - popoverRect.height / 2;
		const PADDING = 5;
		if (popoverTop < PADDING) {
			popoverTop = PADDING;
		} else if (popoverTop + popoverRect.height > containerRect.height - PADDING) {
			popoverTop = containerRect.height - popoverRect.height - PADDING;
		}
		mapPointPopover.style.top = `${popoverTop}px`;
		mapPointPopover.style.left = `${popoverLeft}px`;
		mapPointPopover.style.transform = '';
		mapPointPopover.classList.remove('popover-left', 'popover-right');
		mapPointPopover.classList.add(positionClass);
	}
	function showMapPopover(apartment, pointElement) {
		if (pinnedApartmentForPopover && pinnedApartmentForPopover.name !== apartment.name) { return; }
		updatePopoverContent(apartment);
		positionPopover(pointElement);
		mapPointPopover.style.display = 'block';
	}
	function hideMapPopover() {
		if (pinnedApartmentForPopover) { return; }
		if (mapPointPopover) { mapPointPopover.style.display = 'none'; }
	}
	function togglePinnedPopover(apartment, pointElement) {
		const previouslyPinnedElement = mapDisplayContainer.querySelector('.location-point-pinned');
		if (pinnedApartmentForPopover && pinnedApartmentForPopover.name === apartment.name) {
			pinnedApartmentForPopover = null;
			mapPointPopover.style.display = 'none';
			pointElement.classList.remove('location-point-pinned');
		} else {
			if(previouslyPinnedElement) { previouslyPinnedElement.classList.remove('location-point-pinned'); }
			pinnedApartmentForPopover = apartment;
			updatePopoverContent(apartment);
			positionPopover(pointElement);
			mapPointPopover.style.display = 'block';
			pointElement.classList.add('location-point-pinned');
		}
	}

	// --- Core Functions ---
	function updateUIFromState() {
		// Update building select (multi-select)
		if(filterBuildingSelect) {
			Array.from(filterBuildingSelect.options).forEach(option => {
				option.selected = currentFilters.buildings.includes(option.value);
			});
		}
		 // Update floor select (now multi-select)
		 if(filterFloorSelect) {
			Array.from(filterFloorSelect.options).forEach(option => {
				option.selected = currentFilters.floors.includes(option.value); // Check against 'floors' array
			});
		}
		// Update other filters
		if(filterStyleSelect) filterStyleSelect.value = currentFilters.style;
		if(filterUpdatedCheckbox) filterUpdatedCheckbox.checked = currentFilters.updatedOnly;
		if(sortBySelect) sortBySelect.value = currentSort;
	}

	function populateFilters() {
		const buildings = new Set(); const floors = new Set(); const styles = new Set();
		allApartments.forEach(apt => {
			const buildingNum = getBuildingNumber(apt.name);
			if (buildingNum) buildings.add(buildingNum);
			if (apt.floor) floors.add(apt.floor); // Collect all unique floors
			styles.add(apt.style || 'N/A');
		});

		// Populate Buildings
		if(filterBuildingSelect) {
			filterBuildingSelect.innerHTML = '';
			Array.from(buildings).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(building => {
				const option = document.createElement('option');
				option.value = building; option.textContent = `Building ${building}`;
				filterBuildingSelect.appendChild(option);
			});
		}

		// Populate Floors (No "All Floors" option for multi-select)
		if(filterFloorSelect) {
			filterFloorSelect.innerHTML = ''; // Clear existing options
			const sortedFloors = Array.from(floors).sort((a, b) => {
				const floorOrder = { "First Floor": 1, "Second Floor": 2, "Third Floor": 3 };
				return (floorOrder[a] || 99) - (floorOrder[b] || 99);
			});
			sortedFloors.forEach(floor => {
				const option = document.createElement('option');
				option.value = floor; option.textContent = floor;
				filterFloorSelect.appendChild(option);
			});
		}

		// Populate Styles
		if(filterStyleSelect) {
			filterStyleSelect.innerHTML = '<option value="all">All Styles</option>';
			if (!styles.has('N/A')) { styles.add('N/A'); }
			Array.from(styles).sort().forEach(style => {
				const option = document.createElement('option');
				option.value = style; option.textContent = style;
				filterStyleSelect.appendChild(option);
			});
		}

		updateUIFromState(); // Reflect loaded/default state in UI
	}

	function renderApartmentList(apartmentsToDisplay) {
		// Renders the list of apartment cards (no changes needed here for floor filter)
		if (!apartmentListContainer) { console.error("Apartment list container not found!"); return; }
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
			let detailsListHtml = Array.isArray(apt.details) && apt.details.length > 0 ? `<ul class="list-disc list-inside text-sm text-gray-600 mt-1">${apt.details.map(d => `<li>${d || 'N/A'}</li>`).join('')}</ul>` : '<p class="text-sm text-gray-500 mt-1">No specific details.</p>';
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

	function applyFiltersAndSorting() {
		// Filters apartments based on current selections
		currentFilteredApartments = allApartments.filter(apt => {
			const buildingNum = getBuildingNumber(apt.name);
			// Building filter logic (unchanged)
			const buildingMatch = currentFilters.buildings.length === 0 || (buildingNum && currentFilters.buildings.includes(buildingNum));
			// Floor filter logic (updated for multi-select)
			const floorMatch = currentFilters.floors.length === 0 || (apt.floor && currentFilters.floors.includes(apt.floor));
			// Style filter logic (unchanged)
			const styleMatch = currentFilters.style === 'all' || (apt.style ? apt.style === currentFilters.style : currentFilters.style === 'N/A');
			// Updated filter logic (unchanged)
			const updatedMatch = !currentFilters.updatedOnly || (apt.updated_at && apt.created_at && apt.updated_at > apt.created_at);

			return buildingMatch && floorMatch && styleMatch && updatedMatch;
		});

		// Sorting logic (unchanged)
		const [sortKey, sortOrder] = currentSort.split('-');
		currentFilteredApartments.sort((a, b) => {
			let valA, valB;
			switch (sortKey) {
				case 'price': valA = a.price; valB = b.price; break;
				case 'floor':
					const floorOrder = { "First Floor": 1, "Second Floor": 2, "Third Floor": 3 };
					valA = floorOrder[a.floor] || 99; valB = floorOrder[b.floor] || 99;
					break;
				case 'updated': valA = a.updated_at; valB = b.updated_at; break;
				case 'name': default:
					const nameAparts = a.name?.match(/\d+|\D+/g) || [String(a.name)];
					const nameBparts = b.name?.match(/\d+|\D+/g) || [String(b.name)];
					for (let i = 0; i < Math.max(nameAparts.length, nameBparts.length); i++) {
						const partA = nameAparts[i]; const partB = nameBparts[i];
						if (partA === undefined) return sortOrder === 'asc' ? -1 : 1;
						if (partB === undefined) return sortOrder === 'asc' ? 1 : -1;
						const numA = parseInt(partA, 10); const numB = parseInt(partB, 10);
						if (!isNaN(numA) && !isNaN(numB)) {
							if (numA !== numB) return sortOrder === 'asc' ? numA - numB : numB - numA;
						} else {
							if (partA !== partB) return sortOrder === 'asc' ? partA.localeCompare(partB) : partB.localeCompare(partA);
						}
					}
					return 0;
			}
			if (valA == null && valB == null) return 0;
			if (valA == null) return sortOrder === 'asc' ? 1 : -1;
			if (valB == null) return sortOrder === 'asc' ? -1 : 1;
			if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
			if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});

		renderApartmentList(currentFilteredApartments);
		renderMapPoints();
		saveStateToCookie();
	}

	async function initialDataLoad() {
		// Fetches initial data and sets up the page
		loadingIndicator.style.display = 'block';
		apartmentListContainer.innerHTML = '';
		resultsCountP.textContent = '';
		noResultsP.classList.add('hidden');
		updateStatus.textContent = 'Fetching data...';
		[updateButton, toggleMapButton, filterBuildingSelect, filterFloorSelect, filterStyleSelect, filterUpdatedCheckbox, sortBySelect, resetButton].forEach(el => { if(el) el.disabled = true; });

		try {
			const aptResponse = await fetch(`${API_BASE_URL}/apartments`);
			if (!aptResponse.ok) throw new Error(`Apartment fetch failed: ${aptResponse.status}`);
			const aptData = await aptResponse.json();
			if (!Array.isArray(aptData)) throw new Error("Invalid apartment data format.");

			allApartments = aptData.map(apt => ({
				...apt,
				details: Array.isArray(apt.details) ? apt.details : [],
				created_at: Number(apt.created_at) || null,
				updated_at: Number(apt.updated_at) || null,
				coordinates: apt.coordinates && Array.isArray(apt.coordinates) && apt.coordinates.length >= 2 ? apt.coordinates : null
			}));
			console.log("Apartment data loaded.");

			loadingIndicator.style.display = 'none';
			if (allApartments.length === 0) {
				updateStatus.textContent = 'No apartments available.';
				resultsCountP.textContent = '0 apartments found.';
				noResultsP.classList.remove('hidden');
			} else {
				updateStatus.textContent = `Data loaded.`;
				populateFilters();
				applyFiltersAndSorting();
			}
		} catch (error) {
			console.error('Error during initial data load:', error);
			loadingIndicator.style.display = 'none';
			apartmentListContainer.innerHTML = `<p class="text-center text-red-500 p-4 col-span-full">Error loading data. Check console for details.</p>`;
			updateStatus.textContent = 'Error loading data.';
			resultsCountP.textContent = '';
		} finally {
			[updateButton, toggleMapButton, filterBuildingSelect, filterFloorSelect, filterStyleSelect, filterUpdatedCheckbox, sortBySelect, resetButton].forEach(el => { if(el) el.disabled = false; });
			setupMapContainer();
			createMapPopover();
		}
	}

	async function handleUpdateClick() {
		// Handles manual update trigger
		updateStatus.textContent = 'Initiating update...';
		if(updateButton) updateButton.disabled = true;
		try {
			const response = await fetch(`${API_BASE_URL}/update`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
			updateStatus.textContent = 'Update started. Refreshing data in 5 seconds...';
			setTimeout(initialDataLoad, 5000);
		} catch (error) {
			console.error('Error triggering update:', error);
			updateStatus.textContent = `Update failed: ${error.message}`;
			 if(updateButton) updateButton.disabled = false;
		}
	}

	// --- Map Functions --- (No changes needed in map functions themselves)
	function setupMapContainer() {
		if (!mapDisplayContainer) return;
		const existingImg = mapDisplayContainer.querySelector('img');
		if (existingImg) {
			mapImageElement = existingImg;
			if(mapImageElement.complete) {
				 mapImageNaturalWidth = mapImageElement.naturalWidth;
				 mapImageNaturalHeight = mapImageElement.naturalHeight;
			} else {
				mapImageElement.onload = () => {
					 mapImageNaturalWidth = mapImageElement.naturalWidth;
					 mapImageNaturalHeight = mapImageElement.naturalHeight;
					 if (mapVisible) renderMapPoints();
				};
			}
			return;
		}
		mapImageElement = document.createElement('img');
		mapImageElement.src = MAP_IMAGE_FILENAME;
		mapImageElement.alt = "Apartment Map";
		mapImageElement.style.display = 'block'; mapImageElement.style.width = '100%'; mapImageElement.style.height = 'auto';
		mapImageElement.onload = () => {
			console.log("Map image loaded for display.");
			mapImageNaturalWidth = mapImageElement.naturalWidth;
			mapImageNaturalHeight = mapImageElement.naturalHeight;
			if (mapVisible) { renderMapPoints(); }
		};
		mapImageElement.onerror = () => {
			console.error("Failed to load map image for display:", MAP_IMAGE_FILENAME);
			mapDisplayContainer.innerHTML = '<p class="text-center text-red-500 p-4">Map image not found.</p>';
			mapImageElement = null;
		};
		mapDisplayContainer.appendChild(mapImageElement);
	}
	function toggleMap() {
		mapVisible = !mapVisible;
		if (mapVisible) {
			mapDisplayContainer.style.display = 'block';
			if(toggleMapButton) {
				toggleMapButton.textContent = 'Hide Map';
				toggleMapButton.classList.remove('bg-teal-500', 'hover:bg-teal-700');
				toggleMapButton.classList.add('bg-gray-500', 'hover:bg-gray-600');
			}
			renderMapPoints();
		} else {
			mapDisplayContainer.style.display = 'none';
			 if(toggleMapButton) {
				toggleMapButton.textContent = 'Show Map';
				toggleMapButton.classList.remove('bg-gray-500', 'hover:bg-gray-600');
				toggleMapButton.classList.add('bg-teal-500', 'hover:bg-teal-700');
			 }
			if (mapPointPopover) mapPointPopover.style.display = 'none';
			pinnedApartmentForPopover = null;
			 const previouslyPinned = mapDisplayContainer.querySelector('.location-point-pinned');
			 if(previouslyPinned) previouslyPinned.classList.remove('location-point-pinned');
		}
	}
	function renderMapPoints() {
		mapDisplayContainer?.querySelectorAll('.location-point').forEach(p => p.remove());
		if (!mapVisible || !mapImageElement || mapImageNaturalWidth === 0 || currentFilteredApartments.length === 0) {
			if (mapPointPopover) mapPointPopover.style.display = 'none';
			pinnedApartmentForPopover = null;
			return;
		}
		const currentImageWidth = mapImageElement.offsetWidth;
		const currentImageHeight = mapImageElement.offsetHeight;
		if (currentImageWidth <= 0 || currentImageHeight <= 0) return;

		let pointsRenderedCount = 0;
		currentFilteredApartments.forEach((apt, aptIndex) => {
			if (apt.coordinates && Array.isArray(apt.coordinates) && apt.coordinates.length >= 2) {
				const [xPercent, yPercent] = apt.coordinates;
				const leftPx = (xPercent / 100) * currentImageWidth;
				const topPx = (yPercent / 100) * currentImageHeight;
				const pointElement = document.createElement('div');
				pointElement.className = 'location-point';
				pointElement.style.left = `${leftPx}px`;
				pointElement.style.top = `${topPx}px`;
				pointElement.apartmentData = apt;
				pointElement.addEventListener('mouseenter', () => showMapPopover(apt, pointElement));
				pointElement.addEventListener('mouseleave', () => hideMapPopover());
				pointElement.addEventListener('click', () => togglePinnedPopover(apt, pointElement));
				mapDisplayContainer.appendChild(pointElement);
				pointsRenderedCount++;
			} else {
				console.debug(`Apartment ${apt.name || ('(index ' + aptIndex + ')')} missing coordinates.`);
			}
		});
		console.log(`Rendered ${pointsRenderedCount} points.`);

		if (pinnedApartmentForPopover) {
			const stillVisiblePoint = Array.from(mapDisplayContainer.querySelectorAll('.location-point'))
									  .find(p => p.apartmentData.name === pinnedApartmentForPopover.name);
			if (stillVisiblePoint) {
				updatePopoverContent(pinnedApartmentForPopover);
				positionPopover(stillVisiblePoint);
				mapPointPopover.style.display = 'block';
				stillVisiblePoint.classList.add('location-point-pinned');
			} else {
				mapPointPopover.style.display = 'none';
				pinnedApartmentForPopover = null;
			}
		} else {
			 if(mapPointPopover) mapPointPopover.style.display = 'none';
		}
	}

	// --- Event Listeners ---
	if(filterBuildingSelect) filterBuildingSelect.addEventListener('change', (e) => {
		// Read selected buildings into the array
		currentFilters.buildings = Array.from(e.target.selectedOptions).map(option => option.value);
		applyFiltersAndSorting();
	});
	// Update floor select listener for multi-select
	if(filterFloorSelect) filterFloorSelect.addEventListener('change', (e) => {
		// Read selected floors into the array
		currentFilters.floors = Array.from(e.target.selectedOptions).map(option => option.value);
		applyFiltersAndSorting();
	});
	if(filterStyleSelect) filterStyleSelect.addEventListener('change', (e) => { currentFilters.style = e.target.value; applyFiltersAndSorting(); });
	if(filterUpdatedCheckbox) filterUpdatedCheckbox.addEventListener('change', (e) => { currentFilters.updatedOnly = e.target.checked; applyFiltersAndSorting(); });
	if(sortBySelect) sortBySelect.addEventListener('change', (e) => { currentSort = e.target.value; applyFiltersAndSorting(); });

	if (updateButton) { updateButton.addEventListener('click', handleUpdateClick); }
	if (resetButton) {
		resetButton.addEventListener('click', () => {
			// Reset filters including the new 'floors' array
			currentFilters = { buildings: [], floors: [], style: 'all', updatedOnly: false };
			currentSort = 'name-asc';
			updateUIFromState();
			applyFiltersAndSorting();
			if(updateStatus) updateStatus.textContent = 'Filters reset.';
			if (mapPointPopover) mapPointPopover.style.display = 'none';
			pinnedApartmentForPopover = null;
			 const previouslyPinned = mapDisplayContainer.querySelector('.location-point-pinned');
			 if(previouslyPinned) previouslyPinned.classList.remove('location-point-pinned');
		});
	}
	if (toggleMapButton) { toggleMapButton.addEventListener('click', toggleMap); }
	window.addEventListener('resize', debounce(() => {
		if (mapVisible) renderMapPoints();
	}, 150));

	// --- Initial Load ---
	const loadedState = loadStateFromCookie();
	if (loadedState) {
		// Ensure loaded state includes the 'floors' array correctly
		currentFilters = loadedState.filters;
		currentSort = loadedState.sort;
		// Validation/Defaults (already updated in loadStateFromCookie)
	}
	initialDataLoad(); // Start the application
});

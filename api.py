# -*- coding: utf-8 -*-
# filename          : api.py
# description       : Flask API for apartment data and website
# author            : Rico & Gemini
# date              : 05-12-2025 # Updated Date
# version           : v1.2 # Updated Version
# usage             : flask run
# notes             : Requires Flask, APScheduler. Uses JSON for coordinate lookup.
# license           : MIT
# py version        : 3.10+
#==============================================================================
import os
import json
import atexit
import logging
import sqlite3
from flask import Flask, jsonify, render_template # Removed send_from_directory, current_app if not used directly

# Import necessary functions from your existing scripts
try:
	from database import init_db_command, get_db
	from result import Result
	from scraper import Scraper # Assuming Scraper is correctly defined elsewhere
except ImportError as e:
	logging.error(f"Failed to import required modules (database, result, scraper): {e}")
	logging.error("Ensure database.py, result.py, and scraper.py are in the correct path.")
	raise

from apscheduler.schedulers.background import BackgroundScheduler

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Flask App Setup ---
app = Flask(__name__, template_folder='templates', static_folder='static')

# --- Global Variable for Full Location Data (Layout and Assignments) ---
# Stores the entire parsed data from the JSON file.
full_location_data = {}
LOCATION_DATA_JSON = "apartment_points_layout_v5 (2).json" # Define location file name

# --- Helper Function to Load Full Location Data ---
def load_full_location_data(location_file=LOCATION_DATA_JSON):
	"""Loads the entire location data (layout and assignments) from the JSON file."""
	global full_location_data
	full_location_data = {} # Reset

	if not os.path.exists(location_file):
		logging.warning(f"Location data file not found: {location_file}. Map points and assignments cannot be processed.")
		return False
	try:
		with open(location_file, 'r', encoding='utf-8') as f:
			data = json.load(f)
		if isinstance(data, dict) and 'layout' in data and 'assignments' in data:
			full_location_data = data
			layout_points = len(full_location_data.get('layout', {}))
			assignment_buildings = len(full_location_data.get('assignments', {}))
			logging.info(f"Successfully loaded full location data from {location_file} (Layout: {layout_points} points, Assignments: {assignment_buildings} buildings).")
			return True
		else:
			logging.error(f"Invalid structure in {location_file}. Expected a dictionary with 'layout' and 'assignments' keys.")
			return False
	except json.JSONDecodeError:
		logging.error(f"Error decoding JSON from {location_file}.")
		return False
	except Exception as e:
		logging.error(f"Error loading full location data from {location_file}: {e}", exc_info=True)
		return False

# --- Database Setup ---
with app.app_context():
	try:
		init_db_command()
		logging.info("DB initialization check complete.")
	except sqlite3.OperationalError: # More specific error for "table already exists"
		logging.info("DB likely already initialized.")
	except Exception as e:
		logging.error(f"Error during DB initialization: {e}", exc_info=True)

	# --- Load Full Location Data on Startup ---
	load_full_location_data()


# --- Background Scheduler Setup ---
def scheduled_update():
	"""Function wrapper for scheduled updates."""
	with app.app_context(): # Create app context for background task
		logging.info("Running scheduled apartment update...")
		try:
			scraper = Scraper() # Assuming Scraper is properly initialized
			results_from_scraper = scraper.get_results()
			
			# Result class no longer handles location_point_index directly from DB.
			# It's determined at retrieval time using the JSON.
			for res_data in results_from_scraper: # Assuming scraper returns dicts or objects convertible to Result
				# Ensure res_data has the necessary fields for Result constructor
				# (name, floor, style, page_url, price, details)
				if isinstance(res_data, Result): # If scraper already returns Result objects
					apartment_result = res_data
				else: # If scraper returns dicts or other types, adapt here
					# This is an example, adjust based on what scraper.get_results() returns
					apartment_result = Result(
						name=res_data.get('name'),
						floor=res_data.get('floor'),
						style=res_data.get('style'),
						page_url=res_data.get('page_url'),
						price=res_data.get('price'),
						details=res_data.get('details', [])
					)
				apartment_result.update() # Result.update() handles DB interaction
			scraper.close()
			logging.info("Scheduled update completed successfully.")
		except Exception as e:
			logging.error(f"Error during scheduled update: {e}", exc_info=True)
			scraper.close()

scheduler = BackgroundScheduler(daemon=True)
scheduler.add_job(scheduled_update, 'interval', minutes=30) # Interval can be configured
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

# --- Helper function for coordinate lookup ---
def _find_point_index_for_apartment(apartment_name: str, assignments_data: dict | None) -> str | None:
	"""Finds the point_index for a given apartment name from the assignments data."""
	if not assignments_data or not isinstance(assignments_data, dict):
		return None
	for _building_id, building_assignments in assignments_data.items():
		if not isinstance(building_assignments, dict):
			continue
		for point_idx, apt_name_list in building_assignments.items():
			if isinstance(apt_name_list, list) and apartment_name in apt_name_list:
				return str(point_idx) # Ensure point_idx is a string for layout lookup
	return None

# --- API Endpoints ---
@app.route('/api/v1/apartments', methods=['GET'])
def get_apartments():
	"""API endpoint to get all available apartments, enriched with coordinates from JSON."""
	global full_location_data
	try:
		apartments_from_db = Result.get_all() # Fetches Result objects
		if apartments_from_db is None: # get_all now returns [] for no results
			apartments_from_db = []

		apartment_list = []
		
		# Ensure full_location_data is loaded
		if not full_location_data:
			logging.warning("Full location data is not loaded. Attempting to reload.")
			load_full_location_data()

		current_assignments = full_location_data.get('assignments')
		current_layout = full_location_data.get('layout')

		for apartment_obj in apartments_from_db:
			apt_dict = apartment_obj.sanitize() if hasattr(apartment_obj, 'sanitize') else dict(apartment_obj)
			
			# Details should already be a list by Result.__init__
			# apt_dict['details'] is already a list

			# Find coordinates using the apartment name and the JSON data
			apt_name = apt_dict.get('name')
			coordinates = None
			if apt_name and current_assignments and current_layout:
				point_index = _find_point_index_for_apartment(apt_name, current_assignments)
				if point_index and point_index in current_layout:
					coordinates = current_layout[point_index]
				else:
					logging.debug(f"Could not find point_index or coordinates for apartment: {apt_name}, found point_index: {point_index}")

			apt_dict['coordinates'] = coordinates # Add coordinates to the apartment dict
			apartment_list.append(apt_dict)

		return jsonify(apartment_list)
	except Exception as e:
		logging.error(f"Error fetching apartments: {e}", exc_info=True)
		return jsonify({"error": "Failed to fetch apartment data"}), 500

@app.route('/api/v1/update', methods=['POST'])
def trigger_update():
	"""API endpoint to manually trigger the apartment data update."""
	logging.info("Manual update triggered via API.")
	try:
		# Re-using the scheduled_update logic within an app context
		with app.app_context():
			scheduled_update() # Call the same function used by the scheduler
		return jsonify({"message": "Apartment data update initiated successfully."}), 200
	except Exception as e:
		logging.error(f"Error during manual update trigger: {e}", exc_info=True)
		return jsonify({"error": "Failed to initiate update"}), 500

@app.route('/api/v1/layout', methods=['GET'])
def get_layout():
	"""API endpoint to get the map point layout data."""
	global full_location_data
	if not full_location_data or 'layout' not in full_location_data:
		logging.info("Layout data not loaded or missing 'layout' key, attempting to reload...")
		load_full_location_data()

	if not full_location_data or 'layout' not in full_location_data:
		 return jsonify({"error": "Map layout data not available."}), 404
	
	# Return only the layout part, as per original intention
	return jsonify(full_location_data.get('layout', {}))

def write_layout_to_database():
	"""Writes the layout data (from JSON) to the 'apartment_points' database table."""
	# This function's utility might need re-evaluation if the JSON is the sole source of truth
	# for coordinates. For now, it's updated to use full_location_data.
	global full_location_data
	if not full_location_data or 'layout' not in full_location_data:
		logging.warning("Cannot write layout to DB: full_location_data or its 'layout' key is missing.")
		if not full_location_data: load_full_location_data() # Attempt to load if missing
		if not full_location_data or 'layout' not in full_location_data: return


	layout_to_write = full_location_data.get('layout', {})
	if not layout_to_write:
		logging.info("No layout data to write to the database.")
		return

	try:
		db = get_db()
		# Assuming an 'apartment_points' table exists with columns: point_index, x, y, w, h
		# This table is separate from the 'apartments' table.
		for point_index, coords in layout_to_write.items():
			if isinstance(coords, list) and len(coords) == 4:
				db.execute(
					"INSERT OR REPLACE INTO apartment_points (point_index, x, y, w, h) VALUES (?, ?, ?, ?, ?)",
					(str(point_index), coords[0], coords[1], coords[2], coords[3])
				)
			else:
				logging.warning(f"Skipping invalid coordinate data for point_index {point_index}: {coords}")
		db.commit()
		logging.info(f"Layout data ( {len(layout_to_write)} points) written to database successfully.")
	except sqlite3.Error as e: # More specific error
		logging.error(f"Error writing layout data to database: {e}", exc_info=True)
	except Exception as e: # Catch other potential errors like get_db() failing
		logging.error(f"An unexpected error occurred while writing layout to database: {e}", exc_info=True)


# --- Website Route ---
@app.route('/')
def index():
	"""Serves the main HTML page."""
	map_image_path = os.path.join(app.static_folder, 'apartment.png')
	map_exists = os.path.exists(map_image_path)
	if not map_exists:
		logging.warning(f"Map image 'apartment.png' not found in '{app.static_folder}'. Map display might be affected.")
	return render_template('index.html', map_exists=map_exists)


# --- Main Execution ---
if __name__ == '__main__':
	# This block is typically for direct execution (python api.py)
	# For development with Flask CLI: `flask run`
	# For production, use a WSGI server like Gunicorn or Waitress.
	logging.info("Flask app starting directly (not recommended for production). Use 'flask run' or a WSGI server.")
	# Ensure debug=False for production. Waitress/Gunicorn will handle worker management.
	app.run(host='0.0.0.0', port=5000, debug=True) # Example: debug=True for local dev

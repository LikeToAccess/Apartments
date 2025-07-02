# -*- coding: utf-8 -*-
# filename          : api.py
# description       : Flask API for apartment data and website
# author            : Rico & Gemini
# date              : 07-01-2025 # Updated Date
# version           : v1.5 # Updated Version
# notes             : Corrected DB initialization call to prevent early exit.
# license           : MIT
# py version        : 3.10+
#==============================================================================
import os
import json
import atexit
import logging
import sqlite3
from flask import Flask, jsonify, render_template

try:
	# CORRECTED: Ensure init_db is imported
	from database import init_db
	from result import Result
	from scraper import Scraper
except ImportError as e:
	logging.error(f"Failed to import required modules: {e}")
	raise

from apscheduler.schedulers.background import BackgroundScheduler

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, template_folder='templates', static_folder='static')

full_location_data = {}
LOCATION_DATA_JSON = "apartment_points_layout_v5 (2).json"

def load_full_location_data(location_file=LOCATION_DATA_JSON):
	"""Loads the entire location data (layout and assignments) from the JSON file."""
	global full_location_data
	full_location_data = {}

	if not os.path.exists(location_file):
		logging.warning(f"Location data file not found: {location_file}. Map points cannot be processed.")
		return False
	try:
		with open(location_file, 'r', encoding='utf-8') as f:
			data = json.load(f)
		if isinstance(data, dict) and 'layout' in data and 'assignments' in data:
			full_location_data = data
			logging.info(f"Successfully loaded full location data from {location_file}.")
			return True
		else:
			logging.error(f"Invalid structure in {location_file}. Expected 'layout' and 'assignments' keys.")
			return False
	except Exception as e:
		logging.error(f"Error loading full location data: {e}", exc_info=True)
		return False

def _find_point_index_for_apartment(apartment_name: str, assignments_data: dict | None) -> str | None:
    """Finds the point_index for a given apartment name from the assignments data."""
    if not assignments_data:
        return None
    for _building_id, building_assignments in assignments_data.items():
        if not isinstance(building_assignments, dict):
            continue
        for point_idx, apt_name_list in building_assignments.items():
            if isinstance(apt_name_list, list) and apartment_name in apt_name_list:
                return str(point_idx)
    return None


# This block is executed when the application starts
with app.app_context():
	try:
		# CORRECTED: Call init_db() instead of the Click command
		init_db()
		logging.info("DB initialization check complete.")
	except sqlite3.OperationalError:
		# This can happen if the tables already exist, which is fine.
		logging.info("DB tables likely already exist.")
	except Exception as e:
		logging.error(f"Error during DB initialization: {e}", exc_info=True)
	
	# Load location data after checking DB
	load_full_location_data()


def run_update_logic():
    """Core logic for scraping, removing old listings, and updating/adding new ones."""
    scraper = None
    logging.info("Starting apartment data update process...")
    try:
        scraper = Scraper()
        results_from_scraper = scraper.get_results()

        scraped_apartment_names = {res.name for res in results_from_scraper}
        apartments_in_db = Result.get_all()
        db_apartment_names = {apt.name for apt in apartments_in_db}
        apartments_to_move = db_apartment_names - scraped_apartment_names

        if apartments_to_move:
            logging.info(f"Found {len(apartments_to_move)} unavailable apartments to archive.")
            for name in apartments_to_move:
                Result.move_to_deleted(name)
        else:
            logging.info("No apartments need to be archived.")

        for apartment_result in results_from_scraper:
            apartment_result.update()

        logging.info("Apartment data update process completed successfully.")

    except Exception as e:
        logging.error(f"Error during update process: {e}", exc_info=True)
    finally:
        if scraper:
            scraper.close()
            logging.info("Scraper resources have been released.")

def scheduled_update():
    """Function wrapper for scheduled updates via APScheduler."""
    with app.app_context():
        run_update_logic()

scheduler = BackgroundScheduler(daemon=True)
scheduler.add_job(scheduled_update, 'interval', minutes=30)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())


@app.route('/api/v1/apartments', methods=['GET'])
def get_apartments():
    """API endpoint to get all available apartments, enriched with coordinates from JSON."""
    global full_location_data
    try:
        apartments_from_db = Result.get_all()
        apartment_list = []
        if not full_location_data:
            load_full_location_data()
        current_assignments = full_location_data.get('assignments')
        current_layout = full_location_data.get('layout')

        for apt_obj in apartments_from_db:
            apt_dict = apt_obj.sanitize()
            apt_name = apt_dict.get('name')
            coordinates = None
            if apt_name and current_assignments and current_layout:
                point_index = _find_point_index_for_apartment(apt_name, current_assignments)
                if point_index and point_index in current_layout:
                    coordinates = current_layout[point_index]
            apt_dict['coordinates'] = coordinates
            apartment_list.append(apt_dict)
        return jsonify(apartment_list)
    except Exception as e:
        logging.error(f"Error fetching apartments: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch apartment data"}), 500

@app.route('/api/v1/apartments/deleted', methods=['GET'])
def get_deleted_apartments():
    """API endpoint to get all deleted/archived apartments."""
    global full_location_data
    try:
        deleted_apartments_from_db = Result.get_all_deleted()
        deleted_list = []
        if not full_location_data:
            load_full_location_data()
        current_assignments = full_location_data.get('assignments')
        current_layout = full_location_data.get('layout')

        for apt_obj in deleted_apartments_from_db:
            apt_dict = apt_obj.sanitize()
            apt_name = apt_dict.get('name')
            coordinates = None
            if apt_name and current_assignments and current_layout:
                point_index = _find_point_index_for_apartment(apt_name, current_assignments)
                if point_index and point_index in current_layout:
                    coordinates = current_layout[point_index]
            apt_dict['coordinates'] = coordinates
            deleted_list.append(apt_dict)
        return jsonify(deleted_list)
    except Exception as e:
        logging.error(f"Error fetching deleted apartments: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch deleted apartment data"}), 500

@app.route('/api/v1/update', methods=['POST'])
def trigger_update():
    """API endpoint to manually trigger the apartment data update."""
    logging.info("Manual update triggered via API.")
    with app.app_context():
        run_update_logic()
    return jsonify({"message": "Apartment data update initiated successfully."}), 200

@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

if __name__ == '__main__':
    # This block is for direct execution, e.g., for local debugging.
    # Production runs should use a WSGI server like Waitress or Gunicorn.
    app.run(host='0.0.0.0', port=5000, debug=True)

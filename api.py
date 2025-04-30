# -*- coding: utf-8 -*-
# filename          : api.py
# description       : Flask API for apartment data and website
# author            : Rico & Gemini
# date              : 04-29-2025
# version           : v1.0
# usage             : flask run
# notes             : Requires Flask, APScheduler
# license           : MIT
# py version        : 3.10+
#==============================================================================
import os
import json
import atexit
import logging
import sqlite3
from flask import Flask, jsonify, render_template, send_from_directory
from apscheduler.schedulers.background import BackgroundScheduler

# Import necessary functions from your existing scripts
from database import init_db_command
from result import Result
from scraper import Scraper


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Flask App Setup ---
app = Flask(__name__, template_folder='templates', static_folder='static')

# Naive database setup
try:
	init_db_command()
	print("DB first-time initialization complete.")
except sqlite3.OperationalError:
	# Assume it's already been created
	pass


# --- Background Scheduler Setup ---
def scheduled_update():
	"""Function wrapper for scheduled updates to run within app context."""
	with app.app_context():
		logging.info("Running scheduled apartment update...")
		try:
			scraper = Scraper()
			results = scraper.get_results()
			# with open("results.json", "w", encoding="utf8") as file:
			# 	json.dump([result.sanitize() for result in results], file, indent=4)
			for result in results:
				# print(result)
				result.update()
			scraper.close()
			logging.info("Scheduled update completed successfully.")
		except Exception as e:
			logging.error(f"Error during scheduled update: {e}", exc_info=True)

scheduler = BackgroundScheduler(daemon=True)
# Schedule run_update to run every hour (adjust as needed)
scheduler.add_job(scheduled_update, 'interval', minutes=30)
scheduler.start()

# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())

# --- API Endpoints ---
@app.route('/api/v1/apartments', methods=['GET'])
def get_apartments():
	"""API endpoint to get all available apartments from the database."""
	try:
		# Use the get_all method from the Result class
		apartments = Result.get_all()
		if apartments is None:
			apartments = [] # Return empty list if no apartments found

		apartment_list = []
		for apartment in apartments:
			# Safely evaluate the details string back to a list
			details_list = eval(apartment.details)
			if isinstance(details_list, list):
				apartment['details'] = details_list
			else:
				apartment['details'] = [] # Default to empty list if eval fails
			apartment_list.append(apartment)

		return jsonify(apartment_list)
	except Exception as e:
		logging.error(f"Error fetching apartments: {e}", exc_info=True)
		return jsonify({"error": "Failed to fetch apartment data"}), 500

@app.route('/api/v1/update', methods=['POST'])
def trigger_update():
	"""API endpoint to manually trigger the apartment data update."""
	logging.info("Manual update triggered via API.")
	try:
		scraper = Scraper()
		results = scraper.get_results()
		# with open("results.json", "w", encoding="utf8") as file:
		# 	json.dump([result.sanitize() for result in results], file, indent=4)
		for result in results:
			# print(result)
			result.update()
		scraper.close()
		return jsonify({"message": "Apartment data update initiated successfully."}), 200
	except Exception as e:
		logging.error(f"Error during manual update trigger: {e}", exc_info=True)
		return jsonify({"error": "Failed to initiate update"}), 500

# --- Website Route ---
@app.route('/')
def index():
	"""Serves the main HTML page."""
	# Check if apartment.png exists, pass flag to template
	map_exists = os.path.exists(os.path.join(app.static_folder, 'apartment.png'))
	if not map_exists:
		logging.warning(f"Map image 'apartment.png' not found in '{app.static_folder}'. Using placeholder.")

	# You could potentially pass initial data here, but fetching via JS is more dynamic
	return render_template('index.html', map_exists=map_exists)

# # --- Static File Route (Optional but good practice) ---
# # This allows serving static files like CSS, JS, and images directly
# # Flask does this by default if static_folder is set, but this is explicit.
# @app.route('/static/<path:filename>')
# def static_files(filename):
# 	return send_from_directory(app.static_folder, filename)


# --- Main Execution ---
if __name__ == '__main__':
	# Use `flask run` command instead of app.run() for development
	# For production, use a proper WSGI server like Gunicorn or Waitress
	# Example: gunicorn -w 4 api:app
	logging.info("Flask app starting. Use 'flask run' in terminal.")
	app.run(debug=True) # Avoid using debug=True in production

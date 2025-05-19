# -*- coding: utf-8 -*-
# filename          : result.py
# description       : Represents an apartment result and interacts with DB
# author            : Rico & Gemini
# email             : rico@rico.cx
# date              : 05-12-2025 # Updated date
# version           : v1.2 # Updated version
# usage             : This file should not be run directly.
# notes             : Removed location_point_index handling. Coordinates are now external.
# license           : MIT
# py version        : 3.10+
#==============================================================================
import sqlite3 # Import sqlite3 for specific error handling
from time import time
from datetime import datetime
import logging # Added logging

# Assuming database.py provides get_db()
try:
	from database import get_db
except ImportError:
	logging.error("Failed to import get_db from database. Ensure database.py is accessible.")
	# Define a dummy function or raise error if needed
	def get_db(): raise RuntimeError("get_db function not available")


class Result(dict):
	def __init__(self,
				 name: str,
				 floor: str,
				 style: str | None,
				 page_url: str,
				 price: int,
				 details: list[str] | str, # Allow str for loading from DB
				 scraper_object: object | None = None,
				 created_at: int | None = None, # Added for loading from DB
				 updated_at: int | None = None, # Added for loading from DB
				 **kwargs):
		self.scraper_object = scraper_object
		self.name = name
		self.floor = floor
		self.style = style
		self.page_url = page_url
		self.price = price
		
		# Handle details potentially being a string from DB
		if isinstance(details, str):
			try:
				# Using eval as per original. Consider ast.literal_eval for safety if format is simple.
				# from ast import literal_eval
				# self.details = literal_eval(details)
				self.details = eval(details)
				if not isinstance(self.details, list):
					self.details = [] # Ensure it's a list
			except (SyntaxError, ValueError, TypeError) as e:
				logging.warning(f"Could not evaluate details string for {name}: {e}. Setting to empty list.")
				self.details = []
		else:
			self.details = details if isinstance(details, list) else []

		self.created_at = created_at
		self.updated_at = updated_at

		# Handle other potential kwargs if needed
		for key, value in kwargs.items():
			setattr(self, key, value)

		# Initialize the dictionary superclass with current attributes
		temp_dict = self.__dict__.copy()
		temp_dict.pop('scraper_object', None) # Ensure scraper_object isn't in the dict part
		super().__init__(temp_dict)


	def __str__(self):
		return (f"Name: {self.name}\n"
				f"Floor: {self.floor}\n"
				f"Style: {self.style}\n"
				f"Page URL: {self.page_url}\n"
				f"Price: ${self.price:,}\n"
				f"Details: {', '.join(self.details)}\n"
				f"Created At: {datetime.fromtimestamp(self.created_at).strftime('%Y-%m-%d %H:%M:%S') if self.created_at else 'N/A'}\n"
				f"Updated At: {datetime.fromtimestamp(self.updated_at).strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else 'N/A'}\n"
				+ ("-" * 40))

	def sanitize(self):
		"""Safely removes the scraper object and returns a dict representation."""
		clean_dict = self.__dict__.copy()
		clean_dict.pop("scraper_object", None)
		# Update the internal dict state (optional, but good practice if used as dict elsewhere)
		# super().update(clean_dict) # Not strictly necessary if __init__ already sets it up
		# super().pop("scraper_object", None) # Already handled by temp_dict in __init__
		return clean_dict

	@staticmethod
	def get(name: str):
		"""Retrieves a single apartment record from the database by its name."""
		db = get_db()
		# Explicitly select columns; location_point_index is removed
		result_row = db.execute(
			"SELECT name, floor, style, page_url, price, details, created_at, updated_at FROM apartments WHERE name = ?",
			(name,)
		).fetchone()
		if not result_row:
			return None

		# Create Result object
		result_obj = Result(
			name=result_row['name'],
			floor=result_row['floor'],
			style=result_row['style'],
			page_url=result_row['page_url'],
			price=result_row['price'],
			details=result_row['details'], # Will be handled by __init__
			created_at=result_row['created_at'],
			updated_at=result_row['updated_at']
		)
		return result_obj

	@staticmethod
	def get_all() -> list['Result']:
		"""Retrieves all apartment records from the database, ordered by name."""
		db = get_db()
		# Explicitly select columns; location_point_index is removed
		results_rows = db.execute(
			"SELECT name, floor, style, page_url, price, details, created_at, updated_at FROM apartments ORDER BY name ASC"
		).fetchall() # fetchall returns a list of Row objects
		
		if not results_rows:
			return [] # Return empty list instead of None

		result_obj_list = []
		for row in results_rows:
			# Create Result object for each row
			result_obj_list.append(
				Result(
					name=row['name'],
					floor=row['floor'],
					style=row['style'],
					page_url=row['page_url'],
					price=row['price'],
					details=row['details'], # Will be handled by __init__
					created_at=row['created_at'],
					updated_at=row['updated_at']
				)
			)
		return result_obj_list

	@staticmethod
	def create(name: str,
			   floor: str,
			   style: str | None,
			   page_url: str,
			   price: int,
			   details: list[str]):
		"""Creates a new apartment record in the database."""
		current_ts = int(time())
		db = get_db()
		try:
			db.execute(
				# location_point_index removed from INSERT
				"INSERT INTO apartments (name, floor, style, page_url, price, details, updated_at, created_at) "
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				(name, floor, style, page_url, price, str(details), current_ts, current_ts)
			)
			db.commit()
			logging.info(f"Created apartment record: {name}")
		except sqlite3.Error as e: # Use specific sqlite3.Error
			logging.error(f"Database error creating record for {name}: {e}")
			# db.rollback() # Consider rollback on error

	def delete(self):
		"""Deletes the apartment record from the database."""
		db = get_db()
		try:
			db.execute(
				"DELETE FROM apartments WHERE name = ?", (self.name,)
			)
			db.commit()
			logging.info(f"Deleted apartment record: {self.name}")
		except sqlite3.Error as e: # Use specific sqlite3.Error
			 logging.error(f"Database error deleting record for {self.name}: {e}")

	def update(self):
		"""Updates the record in the database if changes are detected, or creates if non-existent."""
		current_ts = int(time())
		db = get_db()
		existing = self.get(self.name) # Fetch existing record using the static method

		if not existing:
			logging.info(f"Apartment {self.name} not found in DB. Creating...")
			# Call the static create method
			Result.create(self.name, self.floor, self.style, self.page_url, self.price, self.details)
			return

		# Check if any relevant fields have changed
		try:
			# existing.details is already processed by Result.__init__ if existing is a Result object
			existing_details_list = existing.details 
		except Exception as e: # Broad exception for safety, though details should be a list
			logging.warning(f"Could not process existing.details for {existing.name}: {e}. Defaulting to empty list.")
			existing_details_list = []
		
		current_details_list = self.details

		# Compare fields; location_point_index comparison removed
		if all([self.price == existing.price,
				self.floor == existing.floor,
				self.style == existing.style,
				current_details_list == existing_details_list,
				self.page_url == existing.page_url # Ensure page_url is also checked if it can change
				]):
			# logging.debug(f"No changes detected for {self.name}.") # Optional: for debugging
			return

		logging.info(f"Result {self.name} has changed. Updating...")

		# Update the result in the database; location_point_index removed from UPDATE
		try:
			db.execute(
				"UPDATE apartments SET floor = ?, style = ?, page_url = ?, price = ?, details = ?, updated_at = ? "
				"WHERE name = ?",
				(self.floor, self.style, self.page_url, self.price, str(self.details), current_ts, self.name)
			)
			db.commit()
			logging.info(f"Updated apartment record: {self.name}")
		except sqlite3.Error as e: # Use specific sqlite3.Error
			 logging.error(f"Database error updating record for {self.name}: {e}")
			 # db.rollback() # Consider rollback on error

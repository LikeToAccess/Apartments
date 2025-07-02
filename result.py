# -*- coding: utf-8 -*-
# filename          : result.py
# description       : Represents an apartment result and interacts with DB
# author            : Rico & Gemini
# email             : rico@rico.cx
# date              : 07-01-2025 # Updated date
# version           : v1.4 # Updated version
# notes             : Implemented soft delete by moving records to a deleted_apartments table.
# license           : MIT
# py version        : 3.10+
#==============================================================================
import sqlite3
from time import time
from datetime import datetime
import logging

try:
	from database import get_db
except ImportError:
	logging.error("Failed to import get_db from database. Ensure database.py is accessible.")
	def get_db(): raise RuntimeError("get_db function not available")


class Result(dict):
	# __init__, __str__, sanitize remain the same...
	def __init__(self, name: str, floor: str, style: str | None, page_url: str, price: int, details: list[str] | str, scraper_object: object | None = None, created_at: int | None = None, updated_at: int | None = None, **kwargs):
		self.scraper_object = scraper_object
		self.name = name
		self.floor = floor
		self.style = style
		self.page_url = page_url
		self.price = price
		if isinstance(details, str):
			try:
				self.details = eval(details)
				if not isinstance(self.details, list): self.details = []
			except Exception: self.details = []
		else:
			self.details = details if isinstance(details, list) else []
		self.created_at = created_at
		self.updated_at = updated_at
		for key, value in kwargs.items(): setattr(self, key, value)
		temp_dict = self.__dict__.copy()
		temp_dict.pop('scraper_object', None)
		super().__init__(temp_dict)

	def __str__(self):
		created_str = datetime.fromtimestamp(self.created_at).strftime('%Y-%m-%d %H:%M:%S') if self.created_at else 'N/A'
		updated_str = datetime.fromtimestamp(self.updated_at).strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else 'N/A'
		return (f"Name: {self.name}\nFloor: {self.floor}\nStyle: {self.style}\n"
				f"Page URL: {self.page_url}\nPrice: ${self.price:,}\nDetails: {', '.join(self.details)}\n"
				f"Created At: {created_str}\nUpdated At: {updated_str}\n" + ("-" * 40))

	def sanitize(self):
		clean_dict = self.__dict__.copy()
		clean_dict.pop("scraper_object", None)
		return clean_dict

	@staticmethod
	def get(name: str):
		db = get_db()
		result_row = db.execute("SELECT * FROM apartments WHERE name = ?", (name,)).fetchone()
		if not result_row: return None
		return Result(**dict(result_row))

	@staticmethod
	def get_all() -> list['Result']:
		db = get_db()
		results_rows = db.execute("SELECT * FROM apartments ORDER BY name ASC").fetchall()
		return [Result(**dict(row)) for row in results_rows] if results_rows else []

	@staticmethod
	def get_all_deleted() -> list['Result']:
		"""Retrieves all records from the deleted_apartments table."""
		db = get_db()
		results_rows = db.execute("SELECT * FROM deleted_apartments ORDER BY deleted_at DESC").fetchall()
		return [Result(**dict(row)) for row in results_rows] if results_rows else []

	@staticmethod
	def create(name, floor, style, page_url, price, details):
		current_ts = int(time())
		db = get_db()
		try:
			db.execute(
				"INSERT INTO apartments (name, floor, style, page_url, price, details, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				(name, floor, style, page_url, price, str(details), current_ts, current_ts)
			)
			db.commit()
			logging.info(f"Created apartment record: {name}")
		except sqlite3.Error as e:
			logging.error(f"Database error creating record for {name}: {e}")

	@staticmethod
	def move_to_deleted(name: str):
		"""Moves an apartment from the 'apartments' table to the 'deleted_apartments' table."""
		db = get_db()
		try:
			# Start a transaction
			with db:
				# 1. Fetch the record to be deleted
				apartment_to_move = db.execute("SELECT * FROM apartments WHERE name = ?", (name,)).fetchone()

				if not apartment_to_move:
					logging.warning(f"Attempted to move non-existent apartment: {name}")
					return

				# 2. Insert it into the deleted_apartments table
				db.execute(
					"""INSERT INTO deleted_apartments (name, floor, style, page_url, price, details, created_at, updated_at, deleted_at)
					   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
					(*apartment_to_move, int(time()))
				)

				# 3. Delete it from the main apartments table
				db.execute("DELETE FROM apartments WHERE name = ?", (name,))
			
			logging.info(f"Moved unavailable apartment to deleted records: {name}")

		except sqlite3.Error as e:
			logging.error(f"Database error moving record for {name}: {e}")

	def update(self):
		current_ts = int(time())
		db = get_db()
		existing = self.get(self.name)

		if not existing:
			logging.info(f"Apartment {self.name} not found in DB. Creating...")
			self.create(self.name, self.floor, self.style, self.page_url, self.price, self.details)
			return

		existing_details_list = existing.details if isinstance(existing.details, list) else []
		
		if all([self.price == existing.price, self.floor == existing.floor, self.style == existing.style,
				self.details == existing_details_list, self.page_url == existing.page_url]):
			return

		logging.info(f"Result {self.name} has changed. Updating...")
		try:
			db.execute(
				"UPDATE apartments SET floor = ?, style = ?, page_url = ?, price = ?, details = ?, updated_at = ? WHERE name = ?",
				(self.floor, self.style, self.page_url, self.price, str(self.details), current_ts, self.name)
			)
			db.commit()
			logging.info(f"Updated apartment record: {self.name}")
		except sqlite3.Error as e:
			 logging.error(f"Database error updating record for {self.name}: {e}")

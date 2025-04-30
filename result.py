# -*- coding: utf-8 -*-
# filename          : result.py
# description       :
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v1.0
# usage             : This file should not be run directly.
# notes             :
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
from time import time
from datetime import datetime

from database import get_db


class Result(dict):
	def __init__(self,
				 name: str,
				 floor: str,
				 style: str | None,
				 page_url: str,
				 price: int,
				 details: list[str],
				 scraper_object: object | None = None,
				 **kwargs):
		self.scraper_object = scraper_object
		self.name = name
		self.floor = floor
		self.style = style
		self.page_url = page_url
		self.price = price
		self.details = details
		for key, value in kwargs.items():
			setattr(self, key, value)
		super().__init__(self.__dict__)

	def __str__(self):
		return f"Name: {self.name}\n" \
			   f"Floor: {self.floor}\n" \
			   f"Style: {self.style}\n" \
			   f"Page URL: {self.page_url}\n" \
			   f"Price: ${self.price:,}\n" \
			   f"Details: {', '.join(self.details)}\n" \
			   + ("-" * 40)
			   # f"Created: {datetime.fromtimestamp(self.created_at)}\n" \
			   # f"Updated: {datetime.fromtimestamp(self.updated_at)}\n" \

	def sanitize(self):
		"""Safely removes the scraper object from the result"""
		try:
			del self.scraper_object
		except AttributeError:
			pass

		# Update the underlying dictionary since it's a dict subclass
		self.pop("scraper_object", None)
		return self.__dict__

	@staticmethod
	def get(name):
		db = get_db()
		result = db.execute(
			"SELECT * FROM apartments WHERE name = ?", (name,)
		).fetchone()
		if not result:
			return None

		result = Result(name=result[0],
						floor=result[1],
						style=result[2],
						page_url=result[3],
						price=result[4],
						details=result[5],
						created_at=result[6],
						updated_at=result[7])
		return result

	@staticmethod
	def get_all():
		db = get_db()
		results = db.execute(
			"SELECT * FROM apartments ORDER BY name ASC"
		).fetchall()
		if not results:
			return None

		result_obj_list = []
		for result in results:
			result_obj_list.append(
				Result(name=result[0],
					   floor=result[1],
					   style=result[2],
					   page_url=result[3],
					   price=result[4],
					   details=result[5],
					   created_at=result[6],
					   updated_at=result[7])
			)
		return result_obj_list

	@staticmethod
	def create(name: str,
			   floor: str,
			   style: str | None,
			   page_url: str,
			   price: int,
			   details: list[str]):
		created_at = int(time())
		db = get_db()
		db.execute(
			"INSERT INTO apartments (name, floor, style, page_url, price, details, updated_at, created_at) "
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			(name, floor, style, page_url, price, str(details), created_at, created_at)
		)
		db.commit()

	def delete(self):
		db = get_db()
		db.execute(
			"DELETE FROM apartments WHERE name = ?", (self.name,)
		)
		db.commit()

	def update(self):
		update_at = int(time())
		db = get_db()
		# Create if it doesn't exist
		existing = self.get(self.name)
		if not existing:
			self.create(self.name, self.floor, self.style, self.page_url, self.price, self.details)
			return
		if all([self.price == existing.price,
		        self.floor == existing.floor,
				self.style == existing.style,
				str(self.details) == existing.details]):
			return
		print(f"Result {self.name} has changed. Updating...")

		# Update the result in the database
		db.execute(
			"UPDATE apartments SET floor = ?, style = ?, page_url = ?, price = ?, details = ?, updated_at = ? "
			"WHERE name = ?",
			(self.floor, self.style, self.page_url, self.price, str(self.details), update_at, self.name)
		)
		db.commit()

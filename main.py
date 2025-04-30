# -*- coding: utf-8 -*-
# filename          : main.py
# description       : Find available apartments
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v1.0
# usage             : python main.py
# notes             :
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
# from time import sleep
import json
import sqlite3

from scraper import Scraper
from database import init_db_command


scraper = Scraper()
# Naive database setup
try:
	init_db_command()
	print("DB first-time initialization complete.")
except sqlite3.OperationalError:
	# Assume it's already been created
	pass


def main():
	# for _ in range(10):
	# 	results = scraper.get_results()
	# 	print(f"Results: {len(results)}")
	# 	sleep(5)
	results = scraper.get_results()
	# with open("results.json", "w", encoding="utf8") as file:
	# 	json.dump([result.sanitize() for result in results], file, indent=4)
	for result in results:
		# print(result)
		result.update()
	scraper.close()


if __name__ == "__main__":
	main()

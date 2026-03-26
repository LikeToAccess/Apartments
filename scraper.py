# -*- coding: utf-8 -*-
# filename          : scraper.py
# description       :
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v4.2
# usage             : python main.py
# notes             : Extracts floor plan from onclick attribute for accuracy. Iterates through URLs to ensure data is loaded.
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
from selenium.common.exceptions import NoSuchElementException, JavascriptException
from selenium.webdriver.common.by import By
import time
import re

from timer import timer
from result import Result
from element_find import find_elements_by_xpath
from scraper_tools import ScraperTools


class Scraper(ScraperTools):
	def __init__(self, init: bool = True):
		if not init:
			return
		super().__init__(init)
		self.homepage_url = "https://www.villagesonmcknight.com/"
		self.floor_plans = {
			"Eastview": "https://www.villagesonmcknight.com/floorplans/eastview?Beds=1",
			"Highwood": "https://www.villagesonmcknight.com/floorplans/highwood?Beds=1",
			"Conway": "https://www.villagesonmcknight.com/floorplans/conway?Beds=1",
			"Parkside": "https://www.villagesonmcknight.com/floorplans/parkside?Beds=1",
			"Oakdale": "https://www.villagesonmcknight.com/floorplans/oakdale?Beds=1",
			"Concord": "https://www.villagesonmcknight.com/floorplans/concord?Beds=1"
		}

	# @timer
	def open_link(self, url: str):
		self.driver.get(url)

	@property
	def captcha(self) -> bool:
		try:
			return self.driver.find_element(By.XPATH, "/html/head/title").text == "Just a moment..."
		except NoSuchElementException:
			return False

	def close_modal(self):
		try:
			self.run_script("ysi.nudge.closeNudge();")
			print("Closed modal.")
		except JavascriptException:
			pass

	def get_results(self):
		# Navigate to homepage first to establish session cookies
		print(f"Navigating to homepage: {self.homepage_url}")
		self.open_link(self.homepage_url)
		time.sleep(5) 

		all_results = {} # Use dict to deduplicate by name, but keep the one with a valid floor plan
		
		for fp_name_hint, fp_url in self.floor_plans.items():
			print(f"Scraping Floor Plan Hint: {fp_name_hint} at {fp_url}")
			self.open_link(fp_url)
			time.sleep(5)

			if self.captcha:
				print(f"Challenge detected. Waiting 10s...")
				time.sleep(10)

			self.close_modal()

			try:
				results = self.wait_until_elements_by_xpath("//tr[contains(@class, 'unit-container')]", timeout=10)
			except Exception as e:
				print(f"No results found for {fp_name_hint} URL.")
				continue

			for result in results:
				try:
					result_html = result.get_attribute("outerHTML")
					name = find_elements_by_xpath(result_html, ".//td[@class='td-card-name']/text()")[-1].strip()
					
					# Deduplication: If we already have this apartment with a floor plan, maybe skip
					# But we want to ensure we get the CORRECT floor plan from the onclick
					
					price_text = find_elements_by_xpath(result_html, ".//td[@class='td-card-rent']/text()")[-2].strip()
					price = int(price_text.replace("$", "").replace(",", "")) if price_text else 0
					
					apply_button = find_elements_by_xpath(result_html, ".//td[@class='td-card-footer']/a")
					if not apply_button:
						continue
					
					page_url = apply_button[0].get('href', '').strip()
					onclick = apply_button[0].get('onclick', '')
					
					# Extract ACCURATE floor plan from onclick
					# applyGAClick('Concord', '2 Bed(s)', ...)
					floor_plan = "N/A"
					match = re.search(r"applyGAClick\s*\(\s*['\"]([^'\"]+)['\"]", onclick)
					if match:
						floor_plan = match.group(1)
					else:
						# Fallback to hint if extraction fails
						floor_plan = fp_name_hint
					
					details = find_elements_by_xpath(result_html, ".//td[@class='td-card-details']/ul/li/text()")
					details = [detail.strip("- ") for detail in details]
					
					floor = details[0] if details else "N/A"
					if details: details.pop(0)
					
					if len(details) > 1:
						style = details[0]
						details.pop(0)
					else:
						style = None
						
					res_obj = Result(scraper_object=self,
					                name=name,
					                floor=floor,
					                floor_plan=floor_plan,
					                style=style,
					                page_url=page_url,
					                price=price,
					                details=details)
					
					# Only add if not already present or if we found a better floor plan match
					if name not in all_results or all_results[name].floor_plan == "N/A":
						all_results[name] = res_obj
						
				except Exception as e:
					print(f"Error parsing result: {e}")
					continue
					
		return list(all_results.values())


def main():
	print("Starting scraper...")
	scraper = Scraper()
	results = scraper.get_results()
	print(f"Total results found: {len(results)}")
	if results:
		print("Sample result floor plans:")
		for r in results[:15]:
			print(f"  {r.name}: {r.floor_plan}")
	scraper.close()
	print("Scraper closed.")


if __name__ == "__main__":
	main()

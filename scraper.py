# -*- coding: utf-8 -*-
# filename          : scraper.py
# description       :
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v4.0
# usage             : python main.py
# notes             : Requires 'selenium' library.
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
from selenium.common.exceptions import NoSuchElementException, JavascriptException
from selenium.webdriver.common.by import By

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
		self.search_url = "https://www.villagesonmcknight.com/floorplans/highwood?Beds=1"

	# @timer
	def open_link(self, url: str):
		self.driver.get(url)

	@property
	def captcha(self) -> bool:
		try:
			return self.driver.find_element(By.XPATH, "/html/head/title").text == "Just a moment..."
		except NoSuchElementException:
			print("Captcha not detected.")
			return False

	def close_modal(self):
		try:
			self.run_script("ysi.nudge.closeNudge();")
			print("Closed modal.")
		except JavascriptException:
			pass

	def get_results(self):
		self.open_link(self.search_url)
		if self.captcha:
			print("Captcha detected.")
			input("Press Enter to continue...")
		self.close_modal()

		result_obj_list = []
		results = self.find_elements_by_xpath("//tr[contains(@class, 'unit-container')]")
		for result in results:
			result = result.get_attribute("outerHTML")
			name = find_elements_by_xpath(result, ".//td[@class='td-card-name']/text()")[-1].strip()
			price = find_elements_by_xpath(result, ".//td[@class='td-card-rent']/text()")[0]
			price = int(price.replace("$", "").replace(",", ""))
			page_url = find_elements_by_xpath(result, ".//td[@class='td-card-footer']/a/@href")[0].strip()
			details = find_elements_by_xpath(result, ".//td[@class='td-card-details']/ul/li/text()")
			details = [detail.strip("- ") for detail in details]
			floor = details[0]
			details.pop(0)
			if len(details) > 1:
				style = details[0]
				details.pop(0)
			else:
				style = None
			result = Result(scraper_object=self,
			                name=name,
			                floor=floor,
			                style=style,
			                page_url=page_url,
			                price=price,
			                details=details)
			result_obj_list.append(result)
		return result_obj_list


def main():
	print("Starting scraper...")
	scraper = Scraper()
	results = scraper.get_results()
	print([result.sanitize() for result in results])
	scraper.close()
	print("Scraper closed.")


if __name__ == "__main__":
	main()

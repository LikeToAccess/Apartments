# -*- coding: utf-8 -*-
# filename          : scraper_tools.py
# description       : Helper file for scraping websites and matching filenames to TMDb.
# author            : Rico Alexander
# email             : rico@rico.cx
# date              : 08-01-2025
# version           : v3.0
# usage             : python waitress_serve.py
# notes             : This file should not be run directly.
# license           : MIT
# py version        : 3.12.5 (must run on 3.10 or higher)
#==============================================================================
from time import perf_counter
from collections.abc import Callable

# from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
import undetected_chromedriver as uc
from pyvirtualdisplay import Display


from element_find import FindElement
from element_wait_until import WaitUntilElement


def goto_homepage(function: Callable) -> Callable:
		def wrapper(self, *args, **kwargs):
			result = function(self, *args, **kwargs)
			self.open_link(self.homepage_url)
			return result
		return wrapper


class ScraperTools(WaitUntilElement, FindElement):

	def __init__(self, init: bool = True):
		if not init:
			return
		tic = perf_counter()
		display = Display(visible=0, size=(800, 600))
		display.start()
		capabilities = DesiredCapabilities.CHROME
		capabilities['goog:loggingPrefs'] = {'performance': 'ALL'}  # type: ignore[assignment]
		options = uc.ChromeOptions()
		# user_data_dir = os.path.abspath("selenium_data")
		# options.add_argument("--autoplay-policy=no-user-gesture-required")
		# options.add_argument("log-level=3")
		options.add_argument("--no-sandbox")
		# options.add_experimental_option("prefs", {"download_restrictions": 3})  # Disable downloads
		# options.add_argument(f"user-data-dir={user_data_dir}")
		# options.add_argument("--ignore-certificate-errors-spki-list")
		# # for extension in os.listdir("chrome_extensions"):
		# # 	options.add_extension(f"chrome_extensions/{extension}")
		# if HEADLESS:
		# 	options.add_argument("--headless")
		# 	options.add_argument("--window-size=1920,1080")
		# 	# options.add_argument("--disable-gpu")
		# 	options.add_argument("--mute-audio")
		self.driver = uc.Chrome(options=options)
		self.display = display
		super().__init__(self.driver)
		toc = perf_counter()
		print(f"Completed init in {toc-tic:.2f}s.")

	def open_link(self, url: str):
		self.driver.get(url)

	def redirect(self, url: str):
		if self.current_url() == url:
			return
		# print("Redirecting to correct URL...")
		self.open_link(url)
		# print(self.current_url())

	def resume_video(self):
		self.driver.execute_script(
			"for(v of document.querySelectorAll('video')){v.setAttribute('muted','');v.play()}"
		)

	def pause_video(self):
		self.driver.execute_script(
			"videos = document.querySelectorAll('video'); for(video of videos) {video.pause()}"
		)

	def run_script(self, script: str):
		self.driver.execute_script(script)

	def reload(self):
		self.driver.refresh()

	def current_url(self):
		return self.driver.current_url

	def close(self):
		self.driver.close()
		self.driver.quit()
		# self.display.stop()
		# print("Closed driver.")

	def refresh(self):
		self.driver.refresh()

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
import os
import platform
import subprocess
from time import perf_counter, sleep
from collections.abc import Callable

import undetected_chromedriver as uc
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
		
		options = uc.ChromeOptions()
		options.add_argument("--no-sandbox")
		options.add_argument("--disable-dev-shm-usage")
		
		# Improved headless settings for bypassing detection
		# Using the new headless mode which is harder to detect
		options.add_argument("--headless=new")
		options.add_argument("--window-size=1920,1080")
		
		# Custom User-Agent to look more like a real browser
		options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")

		self.driver = uc.Chrome(options=options, version_main=146)
		super().__init__(self.driver)
		
		toc = perf_counter()
		print(f"Completed init in {toc-tic:.2f}s.")

	def open_link(self, url: str):
		self.driver.get(url)

	def redirect(self, url: str):
		if self.current_url() == url:
			return
		self.open_link(url)

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
		try:
			self.driver.close()
			self.driver.quit()
		except Exception:
			pass

	def refresh(self):
		self.driver.refresh()

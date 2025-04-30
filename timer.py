# -*- coding: utf-8 -*-
# filename          : timer.py
# description       : Decorator function for performance measurement
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v1.0
# usage             : This file should not be run directly.
# notes             : This file should not be run directly.
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
from time import perf_counter
from collections.abc import Callable


def timer(function: Callable) -> Callable:
	def wrapper(*args, **kwargs):
		tic = perf_counter()
		result = function(*args, **kwargs)
		toc = perf_counter()
		print(f"{function.__name__} took {toc - tic:0.2f} second{'' if toc - tic == 1 else 's'}.")
		return result
	return wrapper

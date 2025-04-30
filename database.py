# -*- coding: utf-8 -*-
# filename          : database.py
# description       :
# author            : Rico
# email             : rico@rico.cx
# date              : 04-29-2025
# version           : v1.0
# usage             : python main.py
# notes             : Helper file for database activity
# license           : MIT
# py version        : 3.13.1 (must run on 3.10 or higher)
#==============================================================================
import sqlite3

import click


def get_db():
	conn = sqlite3.connect(
		"database.db", detect_types=sqlite3.PARSE_DECLTYPES
	)
	conn.row_factory = sqlite3.Row

	return conn

def close_db(conn):
	conn.close()

def init_db():
	db = get_db()

	with open("schema.sql", "r", encoding="utf8") as file:
		db.executescript(file.read())

@click.command("init-db")
def init_db_command():
	"""Clear the existing data and create new tables.

	"""
	init_db()
	click.echo("Initialized the database.")

def init_app(app):
	app.teardown_appcontext(close_db)
	app.cli.add_command(init_db_command)

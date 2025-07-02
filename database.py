# -*- coding: utf-8 -*-
# filename          : database.py
# description       : Database connection and initialization helper
# author            : Rico & Gemini
# email             : rico@rico.cx
# date              : 07-01-2025 # Updated date
# version           : v2.0 # Updated version
# usage             : This file should not be run directly.
# notes             : Updated to use Flask's application context for DB connection management.
# license           : MIT
# py version        : 3.10+
#==============================================================================
import sqlite3
import click
from flask import current_app, g

def get_db():
	"""
	Connect to the application's configured database. The connection
	is unique for each request and will be reused if this is called again.
	"""
	if 'db' not in g:
		g.db = sqlite3.connect(
			"database.db",  # In a real app, this might come from current_app.config['DATABASE']
			detect_types=sqlite3.PARSE_DECLTYPES
		)
		g.db.row_factory = sqlite3.Row
	return g.db

def close_db(e=None):
	"""
	If this request connected to the database, close the connection.
	This function is registered to be called when the app context is torn down.
	"""
	db = g.pop('db', None)
	if db is not None:
		db.close()

def init_db():
	"""
	Initializes the database using the schema.sql file.
	"""
	db = get_db()
	# The schema now creates both 'apartments' and 'deleted_apartments' tables.
	with open("schema.sql", "r", encoding="utf8") as f:
		db.executescript(f.read())

@click.command("init-db")
def init_db_command():
	"""
	Command-line function to clear existing data and create new tables.
	Run with 'flask init-db'.
	"""
	init_db()
	click.echo("Initialized the database.")

def init_app(app):
	"""
	Register database functions with the Flask app. This is called from
	the application factory.
	"""
	# Tell Flask to call close_db when cleaning up after returning a response
	app.teardown_appcontext(close_db)
	# Add the new 'init-db' command to the 'flask' command
	app.cli.add_command(init_db_command)

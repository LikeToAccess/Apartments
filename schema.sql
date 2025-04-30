CREATE TABLE apartments (
	name TEXT PRIMARY KEY,
	floor TEXT NOT NULL,
	style TEXT,
	page_url TEXT NOT NULL,
	price INTEGER NOT NULL,
	details TEXT,
	created_at REAL NOT NULL,
	updated_at REAL NOT NULL
);

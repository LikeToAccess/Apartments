CREATE TABLE IF NOT EXISTS apartments (
	name TEXT PRIMARY KEY,
	floor TEXT NOT NULL,
	style TEXT,
	page_url TEXT NOT NULL,
	price INTEGER NOT NULL,
	details TEXT, -- Stored as a string representation of a list, e.g., "['Feature 1', 'Feature 2']"
	created_at REAL NOT NULL, -- Unix timestamp
	updated_at REAL NOT NULL -- Unix timestamp
);

CREATE TABLE IF NOT EXISTS deleted_apartments (
	name TEXT PRIMARY KEY,
	floor TEXT NOT NULL,
	style TEXT,
	page_url TEXT NOT NULL,
	price INTEGER NOT NULL,
	details TEXT,
	created_at REAL NOT NULL,
	updated_at REAL NOT NULL,
	deleted_at REAL NOT NULL -- Unix timestamp when it was moved
);

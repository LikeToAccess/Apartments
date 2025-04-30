from waitress import serve

import api


def main():
	serve(
		api.app,
		host="0.0.0.0",
		port=5000,
		threads=2,
		url_scheme="https"
	)


if __name__ == "__main__":
	main()

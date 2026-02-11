import requests


class ApiError(Exception):
    pass


class PixcavationAPI:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _fetch(self, path, *, method="GET", body=None):
        url = f"{self.base_url}{path}"

        res = requests.request(
            method,
            url,
            headers={"Content-Type": "application/json"},
            json=body if body is not None else None,
        )

        content_type = res.headers.get("content-type", "")
        data = res.json() if "application/json" in content_type else res.text

        if not res.ok:
            if isinstance(data, dict):
                raise ApiError(data.get("error") or f"Request failed ({res.status_code})")
            raise ApiError(f"Request failed ({res.status_code})")

        if isinstance(data, dict) and data.get("ok") is False:
            raise ApiError(data.get("error") or "Request failed")

        return data

    def exists(self):
        return self._fetch("/api/game/exists")

    def new_game(self):
        return self._fetch("/api/game/new", method="POST")

    def get_game(self):
        return self._fetch("/api/game")

    def reveal_one_pixel(self, x, y):
        return self._fetch(
            "/api/game/reveal",
            method="POST",
            body={"pixels": [{"x": x, "y": y}]},
        )

    def submit_guess(self, guess):
        return self._fetch(
            "/api/game/submit",
            method="POST",
            body={"guess": guess},
        )

    def give_up(self):
        return self._fetch("/api/game/giveup", method="POST")

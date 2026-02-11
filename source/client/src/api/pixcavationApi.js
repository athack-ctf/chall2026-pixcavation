const BASE_URL = "";

async function apiFetch(path, {method = "GET", body} = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {"Content-Type": "application/json"},
        body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    if (data && typeof data === "object" && data.ok === false) throw new Error(data.error || "Request failed");

    return data;
}

export const pixcavationApi = {
    exists() {
        return apiFetch("/api/game/exists");
    },
    newGame() {
        return apiFetch("/api/game/new", {method: "POST"});
    },
    getGame() {
        return apiFetch("/api/game");
    },
    // revealPixel(x, y) {
    //     return apiFetch("/api/game/reveal", {method: "POST", body: {x, y}});
    // },
    revealPixels(pixels) {
        return apiFetch("/api/game/reveal", {method: "POST", body: {pixels}});
    },
    submitGuess(guess) {
        return apiFetch("/api/game/submit", {method: "POST", body: {guess}});
    },
    giveUp() {
        return apiFetch("/api/game/giveup", {method: "POST"});
    },
};

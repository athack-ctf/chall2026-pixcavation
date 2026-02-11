import React, {useEffect, useMemo, useRef, useState} from "react";
import "./App.css";
import {pixcavationApi} from "./api/pixcavationApi";

function normalizeNewlines(s) {
    return String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function pad3(n) {
    const s = String(n);
    return s.length >= 3 ? s : "0".repeat(3 - s.length) + s;
}

function buildRevealLookup(revealedPixels) {
    const m = new Map();
    for (const p of revealedPixels || []) {
        m.set(`${p.x},${p.y}`, p.pixelVal);
    }
    return m;
}

function makeEmptyGuessGrid(lines, cols) {
    return Array.from({length: lines}, () => Array.from({length: cols}, () => ""));
}

function formatSolutionText(text, lineLen, lineCount) {
    const s = String(text || "");
    if (!lineLen || !lineCount) return s;
    const lines = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(s.slice(i * lineLen, (i + 1) * lineLen));
    }
    return lines.join("\n");
}

/** CONFETTI: fires a short celebration burst */
async function fireConfetti() {
    const confetti = (await import("canvas-confetti")).default;

    const duration = 1200;
    const end = Date.now() + duration;

    // initial burst
    confetti({
        particleCount: 130,
        startVelocity: 45,
        spread: 70,
        ticks: 200,
        origin: {x: 0.5, y: 0.2},
    });

    // gentle follow-up stream
    const frame = () => {
        confetti({
            particleCount: 5,
            startVelocity: 32,
            spread: 75,
            ticks: 180,
            origin: {x: Math.random(), y: 0.05},
        });
        if (Date.now() < end) requestAnimationFrame(frame);
    };

    frame();
}

export default function App() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);

    const [hoverXY, setHoverXY] = useState(null);

    const [toasts, setToasts] = useState([]);
    const toastIdRef = useRef(1);

    const [rulesOpen, setRulesOpen] = useState(false);

    // reveal log is DERIVED from server state so it survives reloads
    const logRef = useRef(null);

    // submission inputs
    const [guessGrid, setGuessGrid] = useState(() => makeEmptyGuessGrid(2, 8));
    const inputsRef = useRef([]);

    // CONFETTI: fire only once per solve
    const confettiFiredRef = useRef(false);

    // MIN FIX: stops double bootstrap in React 18 StrictMode (dev)
    const didBootstrapRef = useRef(false);

    const finished = Boolean(state?.finished);

    // single-submission state flag
    const hasSubmitted = Boolean(state?.hasSubmitted);

    const canSubmit = state && !busy && !hasSubmitted && !state.forfeited;
    const canReveal = Boolean(state) && !busy;
    const canGiveUp = Boolean(state) && !busy && !state.finished && !hasSubmitted;
    const canNewGame = !busy;

    // lookup for rendering
    const revealLookup = useMemo(
        () => buildRevealLookup(state?.revealedPixels || []),
        [state?.revealedPixels]
    );

    // reveal log displayed in sidebar (in order returned by backend)
    const revealLog = useMemo(() => {
        const px = state?.revealedPixels || [];
        return px.map((p) => ({x: p.x, y: p.y, pixelVal: p.pixelVal}));
    }, [state?.revealedPixels]);

    function pushToast(type, msg) {
        const id = toastIdRef.current++;
        setToasts((t) => [...t, {id, type, msg}]);
        setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== id));
        }, 2600);
    }

    async function refresh() {
        const r = await pixcavationApi.getGame();
        setState(r.state);

        // If dimensions changed, ensure guess grid matches expected size
        setGuessGrid((prev) => {
            const L = r.state.textLineCount;
            const C = r.state.textLineLength;
            if (prev.length === L && prev[0]?.length === C) return prev;
            return makeEmptyGuessGrid(L, C);
        });
    }

    async function bootstrap() {
        setBusy(true);
        try {
            const ex = await pixcavationApi.exists();
            if (!ex.exists) {
                setRulesOpen(true);
                await pixcavationApi.newGame();
            } else {
                try {
                    // await pixcavationApi.getGame();
                } catch {
                    await pixcavationApi.newGame();
                }
            }
            await refresh();
        } catch (e) {
            pushToast("error", e.message || "Failed to initialize.");
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (didBootstrapRef.current) return;
        didBootstrapRef.current = true;

        bootstrap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // CONFETTI: trigger when solved becomes true (and only once)
    useEffect(() => {
        const justSolved = Boolean(state?.flagGranted) && Boolean(state?.flag);
        if (justSolved && !confettiFiredRef.current) {
            confettiFiredRef.current = true;
            fireConfetti().catch(() => {
            });
        }
        if (!justSolved) {
            confettiFiredRef.current = false;
        }
    }, [state?.flagGranted, state?.flag]);

    // keep reveal log scrolled
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [revealLog.length]);

    // keep guess grid sized to state
    useEffect(() => {
        if (!state) return;
        setGuessGrid((prev) => {
            const L = state.textLineCount;
            const C = state.textLineLength;
            if (prev.length === L && prev[0]?.length === C) return prev;
            return makeEmptyGuessGrid(L, C);
        });
    }, [state?.textLineCount, state?.textLineLength]);

    // Grid rendering helpers
    const gridW = state?.width || 0;
    const gridH = state?.height || 0;

    function getPixelValForRender(x, y) {
        if (!state) return null;

        if (finished && Array.isArray(state.pixelMatrix)) {
            return state.pixelMatrix[y]?.[x];
        }

        const k = `${x},${y}`;
        if (revealLookup.has(k)) return revealLookup.get(k);

        return null; // unrevealed
    }

    function wasUserRevealed(x, y) {
        return revealLookup.has(`${x},${y}`);
    }

    function cellClassFor(x, y, isPreview) {
        const v = getPixelValForRender(x, y);

        if (v === null) return isPreview ? "cell cell-earth preview" : "cell cell-earth";
        if (v === 1) return isPreview ? "cell cell-black preview" : "cell cell-black";
        return isPreview ? "cell cell-white preview" : "cell cell-white";
    }

    async function onReveal(x, y) {
        if (!canReveal) return;

        setBusy(true);
        try {
            // no local log mutation; log comes from refreshed state
            await pixcavationApi.revealPixel(x, y);
            await refresh();
        } catch (e) {
            pushToast("error", e.message || "Reveal failed.");
        } finally {
            setBusy(false);
        }
    }

    function guessAllFilled() {
        if (!state) return false;
        const L = state.textLineCount;
        const C = state.textLineLength;
        for (let y = 0; y < L; y++) {
            for (let x = 0; x < C; x++) {
                if (!guessGrid?.[y]?.[x] || guessGrid[y][x].length !== 1) return false;
            }
        }
        return true;
    }

    function buildGuessStringOrNull() {
        if (!state) return null;

        const L = state.textLineCount;
        const C = state.textLineLength;

        if (!guessAllFilled()) return null;

        const lines = [];
        for (let y = 0; y < L; y++) {
            let line = "";
            for (let x = 0; x < C; x++) line += guessGrid[y][x];
            lines.push(line);
        }
        const guess = normalizeNewlines(lines.join("\n"));

        // Strict validation
        const parts = guess.split("\n");
        if (parts.length !== L) return null;
        if (parts.some((ln) => ln.length !== C)) return null;

        return guess.toUpperCase();
    }

    async function onSubmit() {
        if (!state) return;

        const guess = buildGuessStringOrNull();
        if (guess == null) {
            pushToast(
                "error",
                `Invalid format. Need exactly ${state.textLineCount} lines, each exactly ${state.textLineLength} chars.`
            );
            return;
        }

        setBusy(true);
        try {
            await pixcavationApi.submitGuess(guess);
            await refresh();
            pushToast("ok", "Submission sent.");
        } catch (e) {
            pushToast("error", e.message || "Submit failed.");
        } finally {
            setBusy(false);
        }
    }

    async function onGiveUp() {
        if (!canGiveUp) return;
        setBusy(true);
        try {
            await pixcavationApi.giveUp();
            await refresh();
            pushToast("ok", "You gave up. The scripture is revealed.");
        } catch (e) {
            pushToast("error", e.message || "Give up failed.");
        } finally {
            setBusy(false);
        }
    }

    async function onNewGame() {
        if (!canNewGame) return;

        const hasProgress = (state?.revealedCount || 0) > 0 || Boolean(state?.hasSubmitted);
        if (hasProgress) {
            const ok = window.confirm("Starting a new game will erase your current pixcavation. Continue?");
            if (!ok) return;
        }

        setBusy(true);
        try {
            await pixcavationApi.newGame();

            setGuessGrid(
                makeEmptyGuessGrid(state?.textLineCount ?? 2, state?.textLineLength ?? 8)
            );
            inputsRef.current = [];

            await refresh();
            pushToast("ok", "New pixcavation game started.");
        } catch (e) {
            pushToast("error", e.message || "New game failed.");
        } finally {
            setBusy(false);
        }
    }

    function onGuessChange(gy, gx, ch) {
        if (!state) return;

        const next = String(ch || "").slice(0, 1);
        setGuessGrid((prev) => {
            const copy = prev.map((r) => r.slice());
            copy[gy][gx] = next;
            return copy;
        });

        // auto-advance
        if (next) {
            const L = state.textLineCount;
            const C = state.textLineLength;
            const idx = gy * C + gx;
            const nextIdx = idx + 1;
            if (nextIdx < L * C) {
                const el = inputsRef.current[nextIdx];
                if (el) el.focus();
            }
        }
    }

    function onGuessKeyDown(e, gy, gx) {
        if (!state) return;

        const C = state.textLineLength;
        const idx = gy * C + gx;

        if (e.key === "Backspace") {
            const val = guessGrid?.[gy]?.[gx] || "";
            if (val) return;
            const prevIdx = idx - 1;
            if (prevIdx >= 0) {
                const el = inputsRef.current[prevIdx];
                if (el) el.focus();
            }
        }
    }

    const solved = Boolean(state?.flagGranted);
    const submission = state?.submission;

    const exceeded = Boolean(state?.exceededBudget);
    const withinBudget = !exceeded;

    let resultHeadline = solved ? "SOLVED" : "FAILED";
    if (!solved && submission?.correct) resultHeadline = "CORRECT BUT NO FLAG";

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <div className="logoBox">
                        <img src="/pixcavation-logo.png" alt="Pixcavation logo"/>
                    </div>
                    <div className="brandText">
                        <div className="title">Pixcavation</div>
                        <div className="subtitle">
                            <p>Oh boy! They did you dirty. Didn't they?</p>
                        </div>
                    </div>
                </div>

                <div className="topActions">
                    <button className="btn" onClick={onNewGame} disabled={!canNewGame}>
                        New Game
                    </button>
                    <button className="btn danger" onClick={onGiveUp} disabled={!canGiveUp}>
                        I give up!
                    </button>
                    <button className="btn" onClick={() => setRulesOpen(true)} disabled={busy}>
                        Rules
                    </button>
                </div>
            </header>

            <main className="main">
                <div className="centerCol">
                    {/* Preview */}
                    {/*<section className="panel">*/}
                    {/*    <div className="panelHeader">*/}
                    {/*        <div className="panelTitle">Scripture Preview</div>*/}
                    {/*        <div className="panelMeta">Not clickable</div>*/}
                    {/*    </div>*/}
                    {/*    <div className="gridWrap">*/}
                    {/*        <div*/}
                    {/*            className="grid previewGrid"*/}
                    {/*            style={{*/}
                    {/*                gridTemplateColumns: `repeat(${gridW}, 1fr)`,*/}
                    {/*                width: "320px",*/}
                    {/*            }}*/}
                    {/*        >*/}
                    {/*            {Array.from({length: gridH}).map((_, y) =>*/}
                    {/*                Array.from({length: gridW}).map((__, x) => (*/}
                    {/*                    <div key={`p-${x}-${y}`} className={cellClassFor(x, y, true)}/>*/}
                    {/*                ))*/}
                    {/*            )}*/}
                    {/*        </div>*/}
                    {/*    </div>*/}
                    {/*</section>*/}

                    {/* Main Grid */}
                    <section className="panel">
                        <div className="panelHeader">
                            <div className="panelTitle">Scripture Cleaning Site</div>
                            <div className="panelMeta">
                                {hoverXY ? <span>x={hoverXY.x}, y={hoverXY.y}</span> :
                                    <span>Hover a tile to see coordinates</span>}
                            </div>
                        </div>

                        <div className="gridWrap">
                            <div
                                className="grid mainGrid"
                                style={{
                                    gridTemplateColumns: `repeat(${gridW}, 1fr)`,
                                    width: "560px",
                                }}
                            >
                                {Array.from({length: gridH}).map((_, y) =>
                                    Array.from({length: gridW}).map((__, x) => {
                                        const cls = cellClassFor(x, y, false);
                                        const userMarked = finished && wasUserRevealed(x, y);

                                        return (
                                            <button
                                                key={`m-${x}-${y}`}
                                                className={`${cls} ${userMarked ? "userRevealedAfterFinish" : ""}`}
                                                onClick={() => onReveal(x, y)}
                                                disabled={!canReveal}
                                                onMouseEnter={() => setHoverXY({x, y})}
                                                onMouseLeave={() => setHoverXY(null)}
                                                aria-label={`Reveal (${x},${y})`}
                                                type="button"
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="hintRow">
                            <div>
                                Unrevealed = earth • Revealed: 1 = black, 0 = white
                            </div>
                        </div>
                    </section>

                    {/* Submission */}
                    <section className="panel">
                        <div className="panelHeader">
                            <div className="panelTitle">Scripture Submission</div>
                            <div className="panelMeta">
                                {state ? (
                                    <span>
                                        {state.textLineCount} lines × {state.textLineLength} case insensitive characters
                                    </span>
                                ) : (
                                    <span>Loading…</span>
                                )}
                            </div>
                        </div>

                        <div className="submissionGridWrap">
                            <div
                                className="guessGrid"
                                style={{
                                    gridTemplateColumns: `repeat(${state?.textLineLength || 1}, 40px)`,
                                }}
                            >
                                {state &&
                                    Array.from({length: state.textLineCount}).map((_, gy) =>
                                        Array.from({length: state.textLineLength}).map((__, gx) => {
                                            const idx = gy * state.textLineLength + gx;

                                            const disabled = busy || hasSubmitted || state.forfeited;

                                            return (
                                                <input
                                                    key={`g-${gy}-${gx}`}
                                                    ref={(el) => (inputsRef.current[idx] = el)}
                                                    className="guessCell"
                                                    value={guessGrid?.[gy]?.[gx] || ""}
                                                    onChange={(e) => onGuessChange(gy, gx, e.target.value)}
                                                    onKeyDown={(e) => onGuessKeyDown(e, gy, gx)}
                                                    maxLength={1}
                                                    disabled={disabled}
                                                    spellCheck={false}
                                                    autoCapitalize="off"
                                                    autoCorrect="off"
                                                />
                                            );
                                        })
                                    )}
                            </div>
                        </div>

                        <div className="submitRow">
                            <button className="btn primary" onClick={onSubmit}
                                    disabled={!canSubmit || !guessAllFilled()}>
                                Submit
                            </button>
                        </div>

                        {/* Results */}
                        {hasSubmitted && (
                            <div className="resultBox">
                                <div className={`resultLabel ${solved ? "win" : "lose"}`}>
                                    {resultHeadline}
                                </div>

                                {/* budget outcome line */}
                                {submission?.correct && !solved && exceeded && (
                                    <div className="smallNote">
                                        You guessed it, but you <b>went beyond the reveal
                                        budget</b> ({state?.revealedCount ?? 0} / {state?.maxReveals ?? 0}) - no flag.
                                    </div>
                                )}

                                {!submission?.correct && exceeded && (
                                    <div className="smallNote">
                                        You also <b>went beyond the reveal
                                        budget</b> ({state?.revealedCount ?? 0} / {state?.maxReveals ?? 0}).
                                    </div>
                                )}

                                {withinBudget && !solved && submission?.correct && (
                                    <div className="smallNote">
                                        Correct guess, but no flag (unexpected). Budget is fine:
                                        ({state?.revealedCount ?? 0} / {state?.maxReveals ?? 0}).
                                    </div>
                                )}

                                <div className="resultCols">
                                    <div className="resultCol">
                                        <div className="resultTitle">Your attempt</div>
                                        <pre className="mono">
                                            {formatSolutionText(
                                                submission?.attemptedGuess || "[nothing]",
                                                state.textLineLength,
                                                state.textLineCount
                                            )}
                                        </pre>
                                    </div>

                                    <div className="resultCol">
                                        <div className="resultTitle">Correct scripture</div>
                                        <pre className="mono">
                                            {formatSolutionText(state?.text || "", state?.textLineLength, state?.textLineCount)}
                                        </pre>
                                    </div>
                                </div>

                                {solved && state?.flag && (
                                    <div className="flagBox">
                                        <div className="resultTitle">Flag</div>
                                        <pre className="mono">{state.flag}</pre>
                                    </div>
                                )}

                                {!solved && (
                                    <div className="smallNote">
                                        Only <b>one submission</b> is allowed.
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {/* Right sidebar */}
            <aside className="sidebar">
                <div className="sidebarInner">
                    <div className="sidebarTitle">Status</div>

                    <div className="statRow">
                        <span>Revealed</span>
                        <span>
                            {state?.revealedCount ?? 0} / {state?.maxReveals ?? 0}
                        </span>
                    </div>
                    <div className="statRow">
                        <span>Remaining</span>
                        <span>{state?.remainingReveals ?? 0}</span>
                    </div>

                    {/* show budget exceeded */}
                    {state && state.exceededBudget && (
                        <div className="smallNote" style={{marginTop: 10}}>
                            <b>Budget exceeded.</b> You revealed {state.revealedCount} pixels (limit {state.maxReveals}).
                            No flag possible.
                        </div>
                    )}

                    <div className="logTitle">Reveal log</div>
                    <div className="logBox" ref={logRef}>
                        {revealLog.length === 0 ? (
                            <div className="logEmpty">No reveals yet.</div>
                        ) : (
                            revealLog.map((e, i) => (
                                <div key={`${e.x}-${e.y}-${i}`} className="logLine">
                                    {pad3(i + 1)}. ({e.x},{e.y}) =&gt; {e.pixelVal}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="sidebarFooter">
                        An <a href="https://github.com/athack-ctf" target="_blank">@Hack 2026</a> challenge by{" "}
                        <a href="https://anixpasbesoin.github.io/" target="_blank">AnixPasBesoin</a>.
                    </div>
                </div>
            </aside>

            {/* Toasts */}
            <div className="toastHost">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast ${t.type === "error" ? "toastErr" : "toastOk"}`}>
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* Rules modal */}
            {rulesOpen && (
                <Modal onClose={() => setRulesOpen(false)}>
                    <div className="modalTitle">Pixcavation Rules</div>

                    <div className="modalBody">
                        <p>
                            Today, you're an archaeologist desperate to uncover a buried <b>scripture</b>.
                            <br/>
                            The scripture here is a random text concealed beneath a grid of dirty pixels.
                            You gotta clean enough pixels to read the scripture and earn the <b>flag</b>.
                            <br/>
                        </p>
                        <p>
                            <b>Note:</b> The flag is <b>not</b> the scripture itself.
                            <br/>
                            <b>Pro Tip:</b> Just try, I am sure you'll get it.
                        </p>
                    </div>

                    <div className="modalActions">
                        <button className="btn" onClick={() => setRulesOpen(false)}>
                            Close
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function Modal({onClose, children}) {
    function onBackdrop(e) {
        if (e.target === e.currentTarget) onClose();
    }

    return (
        <div className="modalBackdrop" onMouseDown={onBackdrop} role="dialog" aria-modal="true">
            <div className="modal">
                <button className="modalClose" onClick={onClose} type="button" aria-label="Close">
                    <svg className="closeIcon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18"/>
                    </svg>
                </button>
                {children}
            </div>
        </div>
    );
}

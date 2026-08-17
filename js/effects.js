// Purely cosmetic: the star-burst celebration on task completion, and the
// status-box pulse. No DOM structure lives here permanently — every
// element this creates removes itself when its animation ends. Kept
// separate from tasks.js so "what counts as done" (tasks.js) stays
// decoupled from "what that looks like" (here).

const STAR_GLYPHS = ["★", "✦", "✧", "✨"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Bursts a handful of star/spark glyphs outward from `originEl`'s center,
// across the whole viewport (fixed-position layer) so they aren't clipped
// by the small terminal/tasks panes.
export function burstStars(originEl, count = 14) {
  const layer = document.getElementById("fx-layer");
  if (!layer) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "fx-star";
    el.textContent = STAR_GLYPHS[Math.floor(Math.random() * STAR_GLYPHS.length)];
    const angle = rand(0, Math.PI * 2);
    const dist = rand(60, 190);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40; // bias upward, gravity feels better
    const rot = rand(-180, 180);
    const scale = rand(0.7, 1.5);
    const hue = Math.floor(rand(0, 360));
    el.style.left = cx + "px";
    el.style.top = cy + "px";
    el.style.setProperty("--dx", dx + "px");
    el.style.setProperty("--dy", dy + "px");
    el.style.setProperty("--rot", rot + "deg");
    el.style.setProperty("--scale", scale);
    el.style.setProperty("--hue", hue);
    el.style.animationDelay = rand(0, 0.12) + "s";
    layer.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    // safety net in case animationend doesn't fire (tab backgrounded etc.)
    setTimeout(() => el.remove(), 2000);
  }
}

export function pulse(el) {
  if (!el) return;
  el.classList.remove("fx-pulse");
  // force reflow so re-adding the class restarts the animation on repeat completions
  void el.offsetWidth;
  el.classList.add("fx-pulse");
}

export function popIn(el) {
  if (!el) return;
  el.classList.remove("fx-pop");
  void el.offsetWidth;
  el.classList.add("fx-pop");
}

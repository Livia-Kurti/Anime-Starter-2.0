// script.js — handles both pages
const API_BASE = "https://api.jikan.moe/v4";

document.addEventListener("DOMContentLoaded", () => {
  const bodyId = document.body.id;
  if (bodyId === "home") initHome();
  if (bodyId === "generator") initGenerator();
});

/* -------------------- HOME -------------------- */
async function initHome(){
  const ticker = document.getElementById("ticker");
  // try to load seasons/now first, fallback to /anime
  const fetchers = [
    () => fetch(`${API_BASE}/seasons/now`).then(r => r.json()),
    () => fetch(`${API_BASE}/anime`).then(r => r.json())
  ];

  let data = null;
  for (let fn of fetchers){
    try {
      const res = await fn();
      if (res && (res.data ?? res).length) { data = res.data ?? res; break; }
    } catch (err) { /* try next */ }
  }

  if (!data || !data.length){
    ticker.innerHTML = `<div style="padding:30px;color:#777">Unable to load ticker content.</div>`;
    return;
  }

  // Build tiles and duplicate them so the ticker can loop smoothly
  const items = data.slice(0,12).map(mapToCardData);
  const tilesHtml = items.map(renderTile).join("");
  // duplicate content so translateX -50% produces continuous loop
  ticker.innerHTML = tilesHtml + tilesHtml;
  // enable pause/resume on hover of any card using JS (better control)
  setupTickerPause();
}

function mapToCardData(item){
  // Jikan season item may be nested differently (anime or image url)
  const anime = item.anime ? item.anime : item;
  return {
    id: anime.mal_id || anime?.entry?.mal_id || Math.random().toString(36).slice(2),
    title: anime.title || anime.name || anime.image || "Untitled",
    image: (anime.images && anime.images.jpg && anime.images.jpg.image_url) || anime.image_url || anime.images?.jpg?.large_image_url || anime.entry?.images?.jpg?.image_url || anime.trailer?.images?.large || "",
    synopsis: anime.synopsis || anime.entry?.synopsis || (anime.title ? "" : ""),
    genres: (anime.genres && anime.genres.map(g => g.name)) || (anime.entry?.genres && anime.entry.genres.map(g=>g.name)) || []
  };
}

function renderTile(anime){
  const img = anime.image || "";
  const summary = (anime.synopsis || "").slice(0,160);
  const genresHtml = (anime.genres || []).slice(0,4).map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
  return `
    <div class="card" data-id="${anime.id}">
      <img src="${escapeAttr(img)}" alt="${escapeAttr(anime.title)}" loading="lazy" onerror="this.style.opacity=.12">
      <div class="overlay">
        <div class="title">${escapeHtml(anime.title)}</div>
        <div class="meta">${escapeHtml(summary)}</div>
        <div class="genres">${genresHtml}</div>
      </div>
    </div>
  `;
}

function setupTickerPause(){
  const ticker = document.getElementById("ticker");
  // leave CSS animation running; toggle play state on mouse enter/leave
  ticker.addEventListener("mouseover", () => ticker.style.animationPlayState = "paused");
  ticker.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
  // ensure individual card hover also pauses (just in case)
  ticker.querySelectorAll && ticker.querySelectorAll(".card").forEach(c => {
    c.addEventListener("mouseenter", () => ticker.style.animationPlayState = "paused");
    c.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
  });
}

/* -------------------- GENERATOR -------------------- */
function initGenerator(){
  const genreSelect = document.getElementById("genreSelect");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const status = document.getElementById("statusMessage");
  const grid = document.getElementById("grid");

  // load genres then initial results
  loadGenresInto(genreSelect).then(() => {
    fetchAndRender({ rating: "G" });
  });

  regenerateBtn.addEventListener("click", () => {
    const selected = genreSelect.value;
    const params = { rating: "G", genreId: selected || null };
    fetchAndRender(params);
  });

  async function fetchAndRender({ rating = "G", genreId = null } = {}){
    status.textContent = "Loading recommendations...";
    grid.innerHTML = "";
    try {
      // build query: rating=G&order_by=popularity (Jikan supports order_by)
      const q = new URLSearchParams();
      if (rating) q.set("rating", rating);
      q.set("order_by", "popularity");
      q.set("limit", "24");
      if (genreId) q.set("genres", genreId); // Jikan v4 uses 'genres' as comma-separated ids
      const url = `${API_BASE}/anime?${q.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        // show API error like in your screenshot
        status.innerHTML = `Oops! Something went wrong<br><strong>API error: ${res.status}</strong><br>Please try refreshing the page or try again later.`;
        return;
      }
      const parsed = await res.json();
      const list = parsed.data || [];
      if (!list.length){
        status.textContent = "No results found for that filter.";
        return;
      }
      status.textContent = "";
      // render grid
      grid.innerHTML = list.map(mapToCardData).map(renderGridCard).join("");
    } catch (err){
      console.error(err);
      status.innerHTML = `Oops! Something went wrong<br><strong>Network or API error</strong><br>Please try again later.`;
    }
  }
}

async function loadGenresInto(selectEl){
  try {
    const res = await fetch(`${API_BASE}/genres/anime`);
    if (!res.ok) return;
    const json = await res.json();
    const data = json.data || [];
    // Exclude specific genres by name
    const excludedGenres = ["Ecchi", "Boys Love", "Adult", "Hentai", "Adult Cast","Avant Garde", "Yuri", "Girls Love", "Yaoi", "Erotica", "Horror", "CGDCT", "Magical Sex Shift", "Crossdressing", "Gore", "Harem","Idols (Female)", "Idols (Male)", "Love Polygon", "Music", "Reverse Harem", "Organized Crime", "Racing", "Military", "Combat Sports", "Iyashikei", "Survival", "Anthropomorphic", "Delinquents", "High Stakes Game", "Otaku Culture", "Parody", "Pets", "Samurai", "Josei", "Villainess", "Seinen", "Psychological", "Gag Humor", "Visual Arts", "Video Game", "Vampire", "Martial Arts", "Love Status Quo", "Reincarnation" ];
    data
      .filter(g => !excludedGenres.includes(g.name))
      .forEach(g => {
        const opt = document.createElement("option");
        opt.value = g.mal_id; // use mal_id in the filter
        opt.textContent = g.name;
        selectEl.appendChild(opt);
      });
  } catch (err){
    console.warn("Failed to load genres", err);
  }
}

function renderGridCard(anime){
  const img = anime.image || "";
  const summary = (anime.synopsis || "").slice(0,140);
  const genresHtml = (anime.genres || []).slice(0,3).map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
  
  // Create HTML options for the dropdown
  const dropdownOptions = [
      `<option value="" disabled selected>+ Add to List</option>`,
      `<option value="Want to Watch">Want to Watch</option>`,
      `<option value="Watching">Watching</option>`,
      `<option value="Completed">Completed</option>`,
      `<option value="Paused">Paused</option>`,
      `<option value="Dropped">Dropped</option>`,
      `<option value="Not Interested">Not Interested</option>`,
  ].join('');

  return `
    <div class="card">
      <img src="${escapeAttr(img)}" alt="${escapeAttr(anime.title)}" loading="lazy" onerror="this.style.opacity=.12">
      <div class="overlay">
        <div class="title">${escapeHtml(anime.title)}</div>
        <div class="meta">${escapeHtml(summary)}</div>
        <div class="genres">${genresHtml}</div>
        
        <div class="actions">
            <select class="status-select" onchange='closeDropdown(this); addToMyList(${JSON.stringify(anime)}, this.value)'>
                ${dropdownOptions}
            </select>
        </div>

      </div>
    </div>
  `;
}

function closeDropdown(selectElement) {
    // This removes focus from the dropdown, forcing it to close immediately.
    selectElement.blur(); 
}

/* -------------------- UTIL -------------------- */
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[s]);
}
function escapeAttr(s){ return escapeHtml(s) }


function openNav(){document.getElementById("mySidenav").style.width="250px";}
function closeNav(){document.getElementById("mySidenav").style.width="0";}

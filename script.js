// script.js — handles Home, Generator, and MyList CRUD pages

// --- CONFIGURATION ---
const API_BASE = "https://api.jikan.moe/v4";
// **IMPORTANT:** This must be the address where your Node.js/Express server is running.
const API_NODE = "http://localhost:3000"; 


// --- PRISMA STATUS MAPPING (For CRUD) ---
// Maps UI display text to the exact Enum string used by Prisma/Backend
const ANIME_STATUSES = {
    WANT_TO_WATCH: "WANT_TO_WATCH",
    NOT_INTERESTED: "NOT_INTERESTED",
    WATCHING: "WATCHING",
    COMPLETED: "COMPLETED",
    PAUSED: "PAUSED",
    DROPPED: "DROPPED"
};

const STATUS_OPTIONS_UI = [
    "Want to Watch", 
    "Watching", 
    "Completed", 
    "Paused", 
    "Dropped",
    "Not Interested"
];

function statusToEnum(uiStatus) {
    switch (uiStatus) {
        case "Want to Watch": return ANIME_STATUSES.WANT_TO_WATCH;
        case "Watching": return ANIME_STATUSES.WATCHING;
        case "Completed": return ANIME_STATUSES.COMPLETED;
        case "Paused": return ANIME_STATUSES.PAUSED;
        case "Dropped": return ANIME_STATUSES.DROPPED;
        case "Not Interested": return ANIME_STATUSES.NOT_INTERESTED;
        default: return ANIME_STATUSES.WANT_TO_WATCH;
    }
}

function enumToStatus(enumStatus) {
    switch (enumStatus) {
        case ANIME_STATUSES.WANT_TO_WATCH: return "Want to Watch";
        case ANIME_STATUSES.WATCHING: return "Watching";
        case ANIME_STATUSES.COMPLETED: return "Completed";
        case ANIME_STATUSES.PAUSED: return "Paused";
        case ANIME_STATUSES.DROPPED: return "Dropped";
        case ANIME_STATUSES.NOT_INTERESTED: return "Not Interested";
        default: return "Unknown";
    }
}


// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    const bodyId = document.body.id;
    if (bodyId === "home") initHome();
    if (bodyId === "generator") initGenerator();
    if (bodyId === "mylist") initMyList(); // NEW: Initialize MyList page
    // Note: You need to add id="mylist" to your MyList.html body tag
});


/* -------------------- HOME -------------------- */
async function initHome(){
    const ticker = document.getElementById("ticker");
    const saved = await fetchMyListIds(); // NEW: Fetch existing IDs to filter recommendations
    
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

    // Filter out saved anime, map data, and render
    const items = data.filter(a => !saved.includes(a.mal_id)).slice(0,12).map(mapToCardData);
    const tilesHtml = items.map(renderTile).join("");
    
    ticker.innerHTML = tilesHtml + tilesHtml;
    setupTickerPause();
}


/* -------------------- GENERATOR -------------------- */
function initGenerator(){
    const genreSelect = document.getElementById("genreSelect");
    const regenerateBtn = document.getElementById("regenerateBtn");
    const status = document.getElementById("statusMessage");
    const grid = document.getElementById("grid");

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
        const saved = await fetchMyListIds(); // NEW: Filter out saved anime
        try {
            const q = new URLSearchParams();
            if (rating) q.set("rating", rating);
            q.set("order_by", "popularity");
            q.set("limit", "24");
            if (genreId) q.set("genres", genreId);
            const url = `${API_BASE}/anime?${q.toString()}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                status.innerHTML = `Oops! API error: ${res.status}`;
                return;
            }
            const parsed = await res.json();
            let list = parsed.data || [];
            
            list = list.filter(a=>!saved.includes(a.mal_id)); // Filter saved anime
            
            if (!list.length){
                status.textContent = "No results found for that filter.";
                return;
            }
            status.textContent = "";
            
            grid.innerHTML = list.map(mapToCardData).map(renderGridCard).join("");
        } catch (err){
            console.error(err);
            status.innerHTML = `Oops! Network or API error.`;
        }
    }
}


/* -------------------- LOAD GENRES -------------------- */
async function loadGenresInto(selectEl){
    try {
        const res = await fetch(`${API_BASE}/genres/anime`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data || [];
        
        const excludedGenres = ["Ecchi", "Boys Love", "Adult", "Hentai", "Adult Cast","Avant Garde", "Yuri", "Girls Love", "Yaoi", "Erotica", "Horror", "CGDCT", "Magical Sex Shift", "Crossdressing", "Gore", "Harem","Idols (Female)", "Idols (Male)", "Love Polygon", "Music", "Reverse Harem", "Organized Crime", "Racing", "Military", "Combat Sports", "Iyashikei", "Survival", "Anthropomorphic", "Delinquents", "High Stakes Game", "Otaku Culture", "Parody", "Pets", "Samurai", "Josei", "Villainess", "Seinen", "Psychological", "Gag Humor", "Visual Arts", "Video Game", "Vampire", "Martial Arts", "Love Status Quo", "Reincarnation" ];
        
        data
            .filter(g => !excludedGenres.includes(g.name))
            .forEach(g => {
                const opt = document.createElement("option");
                opt.value = g.mal_id;
                opt.textContent = g.name;
                selectEl.appendChild(opt);
            });
    } catch (err){
        console.warn("Failed to load genres", err);
    }
}


/* -------------------- MYLIST (CRUD) FUNCTIONS -------------------- */

// READ: Fetch the user's list from your Node backend
async function fetchMyList(filterEnumStatus=""){
    const url=new URL(`${API_NODE}/mylist`);
    if(filterEnumStatus) url.searchParams.append("status",filterEnumStatus);
    
    const res=await fetch(url);
    
    if(!res.ok) {
        console.error("Failed to fetch user list from backend.");
        return [];
    }
    return res.json();
}

// Helper: Fetch IDs of anime already on the list
async function fetchMyListIds(){
    const list = await fetchMyList();
    return list.map(a=>a.jikanId);
}

// CREATE: Add an anime to the list (Used by Tile/Grid buttons)
async function addToMyList(anime, statusUI){
    const status = statusToEnum(statusUI); 

    const payload = {
        jikanId: anime.mal_id, 
        title: anime.title,
        image: anime.image,
        status: status,
    };
    
    const res = await fetch(`${API_NODE}/mylist`,{
        method:"POST",
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload)
    });
    
    if(res.ok){
        // If successful, and we are on the mylist page, refresh
        if(document.body.id === "mylist") renderMyList(); 
    } else {
        const errorData = await res.json();
        alert(errorData.msg || "Failed to add to list.");
    }
}

// UPDATE: Change an anime's status (Used by MyList page dropdown)
async function updateMyList(listEntryId, statusUI){
    const status = statusToEnum(statusUI);
    
    await fetch(`${API_NODE}/mylist/${listEntryId}`,{
        method:"PUT",
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({status})
    });
    
    const filterSelect = document.getElementById("statusFilter");
    renderMyList(filterSelect ? statusToEnum(filterSelect.value) : "");
}

// DELETE: Remove an anime from the list (Used by MyList page remove button)
async function deleteFromMyList(listEntryId){
    await fetch(`${API_NODE}/mylist/${listEntryId}`,{
        method:"DELETE",
    });
    renderMyList();
}


/* -------------------- MYLIST PAGE RENDERING -------------------- */
async function initMyList(){
    const filterSelect=document.getElementById("statusFilter");
    
    if(!filterSelect) return; // Need the dropdown element
    
    // Populate the filter dropdown options
    filterSelect.innerHTML = `<option value="">All Statuses</option>` + STATUS_OPTIONS_UI.map(s => 
        `<option value="${s}">${s}</option>`
    ).join("");
    
    filterSelect.addEventListener("change",()=>renderMyList(statusToEnum(filterSelect.value)));
    
    renderMyList();
}

async function renderMyList(filterEnumStatus=""){
    const listGrid=document.getElementById("mylistGrid");
    const list=await fetchMyList(filterEnumStatus); 
    
    if (!listGrid) return;
    
    listGrid.innerHTML=list.map(a=>{
        const currentStatusUI = enumToStatus(a.status);
        
        const statusOptionsHtml = STATUS_OPTIONS_UI.map(s => {
            const isSelected = s === currentStatusUI ? 'selected' : '';
            return `<option value="${s}" ${isSelected}>${s}</option>`;
        }).join("");
        
        return `
            <div class="card" data-id="${a._id}">
              <img src="${a.image}" alt="${a.title}" loading="lazy" onerror="this.style.opacity=.12">
              <div class="overlay">
                <div class="title">${a.title}</div>
                <select onchange="updateMyList('${a._id}', this.value)">
                  ${statusOptionsHtml}
                </select>
                <button onclick="deleteFromMyList('${a._id}')">Remove</button>
              </div>
            </div>
        `;
    }).join("");
}

// =========================================================
// --- UTILITY FUNCTIONS (Preserved from your working code) ---
// =========================================================

function mapToCardData(item){
    const anime = item.anime ? item.anime : item;
    return {
        // Preserved complex ID lookup
        id: anime.mal_id || anime?.entry?.mal_id || Math.random().toString(36).slice(2),
        mal_id: anime.mal_id || anime?.entry?.mal_id || 0, // Use mal_id for backend (jikanId)
        title: anime.title || anime.name || "Untitled",
        // Preserved complex image lookup
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
                <div class="actions">
                    <button onclick='addToMyList(${JSON.stringify(anime)},"Want to Watch")'>Want to Watch</button>
                    <button onclick='addToMyList(${JSON.stringify(anime)},"Not Interested")'>Not Interested</button>
                </div>
            </div>
        </div>
    `;
}

function renderGridCard(anime){
    const img = anime.image || "";
    const summary = (anime.synopsis || "").slice(0,140);
    const genresHtml = (anime.genres || []).slice(0,3).map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
    return `
        <div class="card">
            <img src="${escapeAttr(img)}" alt="${escapeAttr(anime.title)}" loading="lazy" onerror="this.style.opacity=.12">
            <div class="overlay">
                <div class="title">${escapeHtml(anime.title)}</div>
                <div class="meta">${escapeHtml(summary)}</div>
                <div class="genres">${genresHtml}</div>
                <div class="actions">
                    <button onclick='addToMyList(${JSON.stringify(anime)},"Want to Watch")'>Want to Watch</button>
                    <button onclick='addToMyList(${JSON.stringify(anime)},"Not Interested")'>Not Interested</button>
                </div>
            </div>
        </div>
    `;
}

function setupTickerPause(){
    const ticker = document.getElementById("ticker");
    ticker.addEventListener("mouseover", () => ticker.style.animationPlayState = "paused");
    ticker.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
    ticker.querySelectorAll && ticker.querySelectorAll(".card").forEach(c => {
        c.addEventListener("mouseenter", () => ticker.style.animationPlayState = "paused");
        c.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
    });
}

function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, s => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[s]);
}
function escapeAttr(s){ return escapeHtml(s) }

// Sidenav functions (assumed to be correct)
function openNav(){document.getElementById("mySidenav").style.width="250px";}
function closeNav(){document.getElementById("mySidenav").style.width="0";}
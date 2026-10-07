import { 
    loginWithGoogle, 
    logout, 
    observeAuthState, 
    saveNoteToCloud, 
    deleteNoteFromCloud, 
    subscribeToUserNotes 
} from './firebase-service.js';
 
 document.addEventListener('DOMContentLoaded', () => {

    const QUOTES = [
        "Le succès, c'est tomber sept fois, se relever huit.",
        "La discipline est mère du succès.",
        "Chaque effort compte.",
        "Ton courage de continuer est déjà une victoire.",
        "Chaque pas, même hésitant, te rapproche de ton objectif.",
        "Tu n’as pas perdu, tu as appris. Et ce savoir est une victoire.",
        "Ne crains pas l’échec, crains seulement de ne pas essayer.",
        "Je suis capable de surmonter les obstacles qui se présentent.",
        "Je choisis d’apprendre plutôt que de me décourager."
    ];

    // --- ÉTAT DE L'APPLICATION ---
    let suivis = JSON.parse(localStorage.getItem('noteo_data') || '[]');
    let targetAvg = parseFloat(localStorage.getItem('noteo_target') || '14');

    // NOUVEAU : On récupère la série choisie, ou on met 'D' par défaut
    let userSerie = localStorage.getItem('noteo_serie') || 'D'; 
    
    // NOUVEAU : On définit la liste des matières actives selon la série
    let MATIERE_COEFFS = CONFIG_SERIES[userSerie];


    // --- GESTION DE L'AUTHENTIFICATION GOOGLE & SYNC CLOUD ---
    let currentUser = null;
    let unsubscribeCloud = null;

    // Éléments PC
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const userProfileDiv = document.getElementById('user-profile');
    const userNameSpan = document.getElementById('user-name');

    // Éléments Mobile
    const btnLoginMobile = document.getElementById('btn-login-mobile');
    const btnLogoutMobile = document.getElementById('btn-logout-mobile');
    const userProfileDivMobile = document.getElementById('user-profile-mobile');
    const userNameSpanMobile = document.getElementById('user-name-mobile');

    // Clics pour PC & Mobile
    const handleLogin = async () => await loginWithGoogle();
    const handleLogout = async () => await logout();

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    if (btnLoginMobile) btnLoginMobile.addEventListener('click', handleLogin);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnLogoutMobile) btnLogoutMobile.addEventListener('click', handleLogout);

    // Observer en direct l'état Google
    observeAuthState((user) => {
        currentUser = user;
        if (user) {
            // --- MODE CONNECTÉ (PC & Mobile) ---
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnLoginMobile) btnLoginMobile.style.display = 'none';
            
            if (userProfileDiv) userProfileDiv.style.display = 'flex';
            if (userProfileDivMobile) userProfileDivMobile.style.display = 'flex';
            
            if (userNameSpan) userNameSpan.textContent = user.displayName || "Élève";
            if (userNameSpanMobile) userNameSpanMobile.textContent = (user.displayName || "Élève").split(' ')[0]; // Prénom sur mobile
            
            console.log("Connecté en tant que :", user.displayName);

            unsubscribeCloud = subscribeToUserNotes(user.uid, (cloudNotes) => {
                suivis = cloudNotes;
                localStorage.setItem('noteo_data', JSON.stringify(suivis));
                renderDashboard();
                renderBulletin();
                renderStatsPage();
                renderObjectifs();
            });

        } else {
            // --- MODE HORS-LIGNE (PC & Mobile) ---
            if (btnLogin) btnLogin.style.display = 'block';
            if (btnLoginMobile) btnLoginMobile.style.display = 'block';
            
            if (userProfileDiv) userProfileDiv.style.display = 'none';
            if (userProfileDivMobile) userProfileDivMobile.style.display = 'none';
            
            console.log("Mode hors-ligne : lecture locale.");

            if (unsubscribeCloud) {
                unsubscribeCloud();
                unsubscribeCloud = null;
            }

            suivis = JSON.parse(localStorage.getItem('noteo_data') || '[]');
            renderDashboard();
            renderBulletin();
            renderStatsPage();
            renderObjectifs();
        }
    });

    let activeTrimestreFilter = '1er Trimestre';
    let activeMatiereFilter = 'all';
    let currentEditId = null;
    let evolutionChart = null; 

    // --- INITIALISATION DES DROPDOWNS ---
    const initDropdowns = () => {
        const matiereSelectForm = document.getElementById('matiere');
        const matiereSelectFilter = document.getElementById('bulletin-matiere-filter');
        if (!matiereSelectForm || !matiereSelectFilter) return;

        matiereSelectForm.innerHTML = '';
        matiereSelectFilter.innerHTML = '<option value="all">Toutes les matières</option>';

        Object.keys(MATIERE_COEFFS).forEach(m => {
            const optForm = document.createElement('option');
            optForm.value = m;
            optForm.textContent = `${m} (Coeff ${MATIERE_COEFFS[m]})`;
            matiereSelectForm.appendChild(optForm);

            const optFilter = document.createElement('option');
            optFilter.value = m;
            optFilter.textContent = m;
            matiereSelectFilter.appendChild(optFilter);
        });
    };
    initDropdowns();

    // --- CALCULS STATISTIQUES ---
    function calculateStats(data) {
        const byMatiere = {};
        Object.keys(MATIERE_COEFFS).forEach(m => byMatiere[m] = { sum: 0, weight: 0, avg: null });

        data.forEach(s => {
            const w = s.typeEvaluation === 'interro' ? 0.5 : 1;
            const n = s.typeEvaluation === 'interro' ? (s.note / 10) * 20 : s.note;
            if (byMatiere[s.matiere]) {
                byMatiere[s.matiere].sum += n * w;
                byMatiere[s.matiere].weight += w;
            }
        });

        let totalG = 0, totalC = 0;
        Object.keys(byMatiere).forEach(m => {
            if (byMatiere[m].weight > 0) {
                byMatiere[m].avg = byMatiere[m].sum / byMatiere[m].weight;
                totalG += byMatiere[m].avg * MATIERE_COEFFS[m];
                totalC += MATIERE_COEFFS[m];
            }
        });
        return { byMatiere, generalAvg: totalC > 0 ? totalG / totalC : 0 };
    }

    // --- RENDU : STATISTIQUES (FIX GRAPH BUG) ---
    function renderStatsPage() {
        const trim = document.getElementById('stats-trimestre-select').value;
        const canvas = document.getElementById('evolution-chart');
        const emptyState = document.getElementById('chart-empty-state');
        
        if (!canvas) return;

        // On filtre et on trie par ID (ordre chronologique d'ajout)
        const data = suivis.filter(s => s.trimestre === trim).sort((a, b) => a.id - b.id);
        
        // Nettoyage de l'ancien graphique s'il existe
        if (evolutionChart) {
            evolutionChart.destroy();
            evolutionChart = null;
        }

        if (data.length < 2) {
            canvas.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        const labels = data.map((_, i) => `Note ${i + 1}`);
        const notes = data.map(s => s.typeEvaluation === 'interro' ? (s.note / 10) * 20 : s.note);

        evolutionChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Progression (/20)',
                    data: notes,
                    borderColor: '#4669e5',
                    backgroundColor: '#6594d71b',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#3a5fbc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 20, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                    x: { ticks: { color: '#9ca3af' } }
                }
            }
        });
    }

    // --- RENDU : BULLETIN ---
    function renderBulletin() {
        const tableBody = document.getElementById('suivi-table-body');
        const trimAvgValue = document.getElementById('trim-avg-value');
        const activeFilterDesc = document.getElementById('active-filter-desc');
        const filtersContainer = document.getElementById('trimestre-filters-container');

        if (!tableBody) return;

        // Boutons de filtres trimestres
        filtersContainer.innerHTML = '';
        ['1er Trimestre', '2e Trimestre', '3e Trimestre', 'Année'].forEach(label => {
            const btn = document.createElement('button');
            btn.className = `filter-chip ${activeTrimestreFilter === label ? 'active' : ''}`;
            btn.textContent = label;
            btn.onclick = () => { activeTrimestreFilter = label; renderBulletin(); };
            filtersContainer.appendChild(btn);
        });

        let displayData = activeTrimestreFilter === 'Année' ? suivis : suivis.filter(s => s.trimestre === activeTrimestreFilter);
        const stats = calculateStats(displayData);

        if (activeMatiereFilter !== 'all') {
            const matStat = stats.byMatiere[activeMatiereFilter];
            trimAvgValue.textContent = matStat && matStat.avg !== null ? matStat.avg.toFixed(2) + "/20" : "--/20";
            activeFilterDesc.textContent = `Moyenne en ${activeMatiereFilter}`;
            displayData = displayData.filter(s => s.matiere === activeMatiereFilter);
        } else {
            trimAvgValue.textContent = stats.generalAvg > 0 ? stats.generalAvg.toFixed(2) + "/20" : "--/20";
            activeFilterDesc.textContent = "Toutes les matières";
        }

        tableBody.innerHTML = '';
        displayData.sort((a,b) => b.id - a.id).forEach(s => {
            const noteBase20 = s.typeEvaluation === 'interro' ? (s.note/10)*20 : s.note;
            const color = noteBase20 >= 14 ? '#10b981' : (noteBase20 >= 10 ? '#f59e0b' : '#ef4444');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.matiere}</strong><br><small style="color:#9ca3af">${s.chapitre}</small></td>
                <td><span style="color:${color}; font-weight:800">${s.note}</span><small>/${s.typeEvaluation==='devoir'?'20':'10'}</small></td>
                <td style="text-align:center">${s.commentaires ? `<button class="comment-icon-btn" onclick="openComment('${s.commentaires.replace(/'/g, "\\'")}')">💬</button>` : '-'}</td>
                <td style="text-align:right">
                    <button onclick="startEdit(${s.id})" style="background:none; border:none; color:#9ca3af; margin-right:12px; cursor:pointer;"><img src="icons/edit.svg" class="action-icon" onclick="window.startEdit(${s.id})" title="Modifier"></button>
                    <button onclick="deleteNote(${s.id})" style="background:none; border:none; color:#ef4444; cursor:pointer;"><img src="icons/trash.svg" class="action-icon" onclick="window.deleteNote(${s.id})" title="Supprimer"></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // --- RENDU : DASHBOARD ---
    function renderDashboard() {
        const stats = calculateStats(suivis);
        document.getElementById('dashboard-general-avg').textContent = stats.generalAvg > 0 ? stats.generalAvg.toFixed(2) + "/20" : "--/20";
        const vig = document.getElementById('vigilance-container');
        vig.innerHTML = '';
        const weak = Object.entries(stats.byMatiere).filter(m => m[1].avg !== null).sort((a,b) => a[1].avg - b[1].avg).slice(0, 2);
        if(weak.length === 0) vig.innerHTML = '<p style="color:#9ca3af; font-size:0.8rem;">Ajoutez des notes pour voir vos points faibles.</p>';
        weak.forEach(([name, s]) => {
            const d = document.createElement('div');
            d.style = "display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2f333c";
            d.innerHTML = `<span>${name}</span><span style="color:#ef4444; font-weight:bold;">${s.avg.toFixed(2)}</span>`;
            vig.appendChild(d);
        });
        document.getElementById('random-quote').textContent = `"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"`;
    }

    // --- RENDU : OBJECTIFS ---
    function renderObjectifs() {
        const stats = calculateStats(suivis);
        const progress = targetAvg > 0 ? Math.min(100, (stats.generalAvg / targetAvg) * 100) : 0;
        document.getElementById('progress-bar-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${Math.round(progress)}% de l'objectif (${targetAvg}/20)`;
        const badge = document.getElementById('status-badge');
        if (stats.generalAvg === 0) { badge.textContent = "PAS DE DONNÉES"; badge.style.color = "#9ca3af"; }
        else if (stats.generalAvg >= targetAvg) { badge.textContent = "SUR LA VOIE DU SUCCÈS"; badge.style.color = "#10b981"; }
        else { badge.textContent = "ENCORE DES EFFORTS"; badge.style.color = "#f59e0b"; }
    }

    // --- ACTIONS : FORMULAIRE ---
    document.getElementById('suivi-form').onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const note = parseFloat(f.get('note'));
        const typeEval = f.get('type-evaluation'); // On récupère si c'est un devoir ou une interro

        // 1er Contrôle : Est-ce que c'est bien un nombre ?
        if (isNaN(note)) {
            alert("Erreur : La note saisie n'est pas valide.");
            return;
        }

        // 2ème Contrôle : Définir le plafond selon le type d'évaluation
        const noteMax = (typeEval === 'interro') ? 10 : 20;

        // 3ème Contrôle : Est-ce que la note est dans les limites ?
        if (note < 0 || note > noteMax) {
            alert(`Attention ! Pour un(e) ${typeEval}, la note doit être comprise entre 0 et ${noteMax}.`);
            return; // Le "return" arrête la fonction ici, la note n'est pas sauvegardée.
        }

        const item = {
            id: currentEditId || Date.now(),
            trimestre: f.get('trimestre'),
            matiere: f.get('matiere'),
            chapitre: f.get('chapitre') || "Général",
            note: note,
            typeEvaluation: f.get('type-evaluation'),
            commentaires: f.get('commentaires'),
            aRevoir: document.getElementById('a-revoir').checked
        };

        if (currentEditId) {
            suivis = suivis.map(s => s.id === currentEditId ? item : s);
        } else {
            suivis.push(item);
        }

        localStorage.setItem('noteo_data', JSON.stringify(suivis));

        // --- NOUVEAU : Sauvegarde Cloud si connecté ---
        if (currentUser) {
            saveNoteToCloud(currentUser.uid, item);
        }

        currentEditId = null;
        e.target.reset();
        document.getElementById('submit-btn').textContent = "Sauvegarder";
        document.querySelector('[data-target="section-bulletin"]').click();
    };

    // --- FONCTIONS WINDOW ---
    window.startEdit = (id) => {
        const item = suivis.find(s => s.id === id);
        if (!item) return;
        currentEditId = id;
        document.getElementById('trimestre').value = item.trimestre;
        document.getElementById('matiere').value = item.matiere;
        document.getElementById('chapitre').value = item.chapitre;
        document.getElementById('note').value = item.note;
        document.getElementById('type-evaluation').value = item.typeEvaluation;
        document.getElementById('commentaires').value = item.commentaires;
        document.getElementById('a-revoir').checked = item.aRevoir;
        document.getElementById('submit-btn').textContent = "Mettre à jour";
        document.querySelector('[data-target="section-ajouter"]').click();
    };

    window.deleteNote = (id) => {
        if(confirm("Supprimer définitivement ?")) {
            // 1. Suppression locale
            suivis = suivis.filter(s => s.id !== id);
            localStorage.setItem('noteo_data', JSON.stringify(suivis));
            renderBulletin();

            // 2. --- NOUVEAU : Suppression Cloud si connecté ---
            if (currentUser) {
                deleteNoteFromCloud(currentUser.uid, id);
            }
        }
    };

    window.openComment = (txt) => {
        document.getElementById('modal-text').textContent = txt;
        document.getElementById('comment-modal').classList.add('active');
    };

    // --- NAVIGATION LOGIC ---
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.onclick = () => {
            const target = btn.dataset.target;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll(`[data-target="${target}"]`).forEach(n => n.classList.add('active'));
            document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            if(target === 'section-dashboard') renderDashboard();
            if(target === 'section-bulletin') renderBulletin();
            if(target === 'section-stats') renderStatsPage();
            if(target === 'section-objectifs') renderObjectifs();
        };
    });

    // --- EVENT LISTENERS SECONDAIRES ---
    document.getElementById('bulletin-matiere-filter').onchange = (e) => {
        activeMatiereFilter = e.target.value;
        renderBulletin();
    };
    document.getElementById('stats-trimestre-select').onchange = renderStatsPage;
    document.getElementById('close-modal').onclick = () => document.getElementById('comment-modal').classList.remove('active');
    document.getElementById('save-target').onclick = () => {
        targetAvg = parseFloat(document.getElementById('target-avg').value);
        localStorage.setItem('noteo_target', targetAvg);
        renderObjectifs();
    };

    // INIT
    renderDashboard();
});

    // --- GESTION DE LA PREMIÈRE VISITE (CHOIX DE LA SÉRIE) ---
    const serieModal = document.getElementById('serie-modal');
        
    // Si aucune série n'est enregistrée dans le navigateur, on affiche la modale
    if (!localStorage.getItem('noteo_serie')) {
        serieModal.classList.add('active');
    }

    // La fonction qui se déclenche quand l'utilisateur clique sur sa série
    window.choisirSerie = (serieChoisie) => {
        // 1. On sauvegarde le choix dans la mémoire du téléphone
        localStorage.setItem('noteo_serie', serieChoisie);
        
        // 2. On force le rechargement de la page pour appliquer proprement la nouvelle configuration !
        window.location.reload();
    };

// --- ENREGISTREMENT PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Noteo PWA: Service Worker opérationnel !'))
            .catch(err => console.log('Noteo PWA: Erreur', err));
    });
}

// Ajout dynamique du lien vers le manifeste dans le head du HTML
const link = document.createElement('link');
link.rel = 'manifest';
link.href = 'manifest.json';
document.head.appendChild(link);
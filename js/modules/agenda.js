/**
 * INKA CORP - Módulo de Agenda y Notas
 * Maneja el calendario semanal y las notas por hora
 */

let currentWeekStart = new Date();
// Ajustar al lunes de la semana actual
function resetToMonday(date) {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}
resetToMonday(currentWeekStart);

let searchQuery = '';
let activeCategories = ['trabajo', 'personal', 'importante', 'finanzas'];
let allAgendaData = []; // Cache global de Supabase

/**
 * Sincroniza los datos con Supabase
 */
async function syncAgendaFromSupabase() {
    const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!sb) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;

        const { data, error } = await sb
            .from('ic_agenda')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        allAgendaData = data || [];
        console.log('Agenda sincronizada:', allAgendaData.length, 'registros');
    } catch (err) {
        console.error('Error al sincronizar agenda:', err);
    }
}

/**
 * Abre el modal de agenda
 */
async function openAgendaModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('agenda-modal');
    modal.classList.add('active');
    
    // Resetear búsqueda al abrir
    searchQuery = '';
    const searchInput = document.getElementById('agenda-search-input');
    if (searchInput) searchInput.value = '';
    
    // Cargar datos de la DB antes de mostrar
    await syncAgendaFromSupabase();
    
    renderAgenda();
    renderQuickNotes();
    startTimeIndicator(); 
}

/**
 * Cierra el modal de agenda
 */
function closeAgendaModal() {
    const modal = document.getElementById('agenda-modal');
    modal.classList.remove('active');
    stopTimeIndicator();
}

/**
 * Ir a hoy
 */
function goToToday() {
    currentWeekStart = resetToMonday(new Date());
    // Resetear el input de fecha si existe
    const dateInput = document.getElementById('agenda-date-input');
    if (dateInput) dateInput.value = '';
    renderAgenda();
}

/**
 * Navega a la semana anterior
 */
function prevWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderAgenda();
}

/**
 * Navega a la siguiente semana
 */
function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderAgenda();
}

/**
 * Maneja la búsqueda de notas
 */
let searchDebounce;
function handleAgendaSearch() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        const input = document.getElementById('agenda-search-input');
        if (input) {
            const val = input.value.toLowerCase().trim();
            if (searchQuery === val) return; // Evitar renderizado innecesario si el valor no cambió
            
            searchQuery = val;
            console.log('Buscando en Agenda:', searchQuery);
            
            // Forzar renderizado completo de la agenda
            renderAgenda();
            // Forzar renderizado de notas rápidas
            renderQuickNotes();
            // Buscar en todas las semanas
            renderGlobalSearchResults();
        }
    }, 200);
}

/**
 * Busca notas en todo el historial y las muestra en el sidebar
 */
function renderGlobalSearchResults() {
    const resultsSection = document.getElementById('agenda-search-results-section');
    const container = document.getElementById('agenda-search-results-container');
    if (!resultsSection || !container) return;

    if (!searchQuery) {
        resultsSection.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const matches = allAgendaData.filter(note => {
        const title = (note.title || '').toLowerCase();
        const text = (note.text || '').toLowerCase();
        return title.includes(searchQuery) || text.includes(searchQuery);
    });

    if (matches.length > 0) {
        resultsSection.style.display = 'block';
        container.innerHTML = '';
        
        matches.forEach(match => {
            // Solo procesar si tiene cell_id (notas de calendario)
            if (!match.cell_id) return;

            const parts = match.cell_id.split('-');
            const datePart = parts.slice(0, 3).join('-');
            const hourPart = parts[3];
            
            const resultEl = document.createElement('div');
            resultEl.className = `quick-note-item cat-${match.category || 'trabajo'}`;
            resultEl.style.cursor = 'pointer';
            resultEl.innerHTML = `
                <small style="color: #64748b; font-weight: bold;">${datePart} - ${hourPart}:00</small>
                <p style="margin: 0.2rem 0;">${match.title ? `<strong>${match.title}</strong>: ` : ''}${match.text}</p>
            `;
            resultEl.onclick = () => {
                const targetDate = new Date(datePart + 'T12:00:00');
                currentWeekStart = resetToMonday(targetDate);
                renderAgenda();
            };
            container.appendChild(resultEl);
        });
    } else {
        resultsSection.style.display = 'block';
        container.innerHTML = '<div class="no-notes-msg" style="padding: 0.5rem; text-align: center; font-size: 0.8rem;">No hay coincidencias en el calendario</div>';
    }
}

/**
 * Renderiza la agenda completa
 */
function renderAgenda() {
    const grid = document.getElementById('agenda-grid');
    const monthYearTitle = document.getElementById('agenda-month-year');
    
    if (!grid) return;

    // Resetear recordatorios temporales antes de procesar
    window.tempReminders = {};

    // Actualizar título de mes/año
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    monthYearTitle.textContent = `${months[currentWeekStart.getMonth()]} ${currentWeekStart.getFullYear()}`;

    // Limpiar grid y recargar recordatorios recurrentes si es necesario
    processRecurrentReminders();

    grid.innerHTML = '';

    // 1. Renderizar headers (Esquina + Días)
    const emptyHeader = document.createElement('div');
    emptyHeader.className = 'agenda-header-cell time-header';
    grid.appendChild(emptyHeader);

    const tempDate = new Date(currentWeekStart);

    for (let i = 0; i < 7; i++) {
        const header = document.createElement('div');
        header.className = 'agenda-header-cell';
        
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dayName = document.createElement('span');
        dayName.className = 'agenda-day-name';
        dayName.textContent = dayNames[tempDate.getDay()];
        
        const dayNumber = document.createElement('span');
        dayNumber.className = 'agenda-day-number';
        dayNumber.textContent = tempDate.getDate();
        
        header.appendChild(dayName);
        header.appendChild(dayNumber);
        
        // Resaltar hoy
        const hoy = new Date();
        if (tempDate.toDateString() === hoy.toDateString()) {
            header.classList.add('is-today');
        }

        grid.appendChild(header);
        tempDate.setDate(tempDate.getDate() + 1);
    }

    // 2. Renderizar filas de horas (7am a 10pm)
    for (let hour = 7; hour <= 22; hour++) {
        // Celda de hora
        const timeCell = document.createElement('div');
        timeCell.className = 'agenda-time-cell';
        timeCell.textContent = `${hour}:00`;
        grid.appendChild(timeCell);

        // Celdas de días para esa hora
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const cellDate = new Date(currentWeekStart);
            cellDate.setDate(cellDate.getDate() + dayIdx);
            const dateStr = cellDate.toISOString().split('T')[0];
            const cellId = `${dateStr}-${hour}`;

            const cell = document.createElement('div');
            cell.className = 'agenda-cell';
            cell.dataset.date = dateStr;
            cell.dataset.hour = hour;
            cell.dataset.id = cellId;

            // Cargar notas del storage
            renderNotesInCell(cell, cellId);

            cell.onclick = () => addNoteToCell(cellId, dateStr, hour);
            
            grid.appendChild(cell);
        }
    }
    updateTimeIndicator();
}

/**
 * Renderiza las notas existentes en una celda
 */
function renderNotesInCell(cell, cellId) {
    cell.innerHTML = '';
    const notes = getAgendaNotes(cellId);
    
    // Si hay búsqueda y no hay notas en la celda, no hacemos nada
    if (notes.length === 0) return;

    notes.forEach((note, index) => {
        // Filtrar por categoría primero
        const category = note.category || 'trabajo';
        if (!activeCategories.includes(category)) return;

        // Filtrar por búsqueda (Título o Contenido)
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            const title = (note.title || '').toLowerCase();
            const text = (note.text || '').toLowerCase();
            if (!title.includes(q) && !text.includes(q)) return;
        }

        const noteEl = document.createElement('div');
        noteEl.className = `agenda-note cat-${category} ${note.type === 'reminder' ? 'is-reminder' : ''}`;
        
        const displayTitle = note.title ? `<strong>${note.title}</strong>: ` : '';
        noteEl.innerHTML = `
            <span class="note-dot"></span>
            <span class="note-text">${(note.type === 'reminder' ? '🔔 ' : '') + displayTitle + note.text}</span>
        `;
        noteEl.title = (note.title ? note.title + "\n" : "") + note.text;
        noteEl.onclick = (e) => {
            e.stopPropagation();
            editOrDeleteNote(note.id);
        };
        cell.appendChild(noteEl);
    });
}

/**
 * Agrega una nota o recordatorio a una celda específica
 */
async function addNoteToCell(cellId, date, hour) {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Evento',
        customClass: {
            container: 'agenda-swal-container',
            popup: 'agenda-swal-custom',
            title: 'agenda-swal-title',
            confirmButton: 'btn-agenda-save',
            cancelButton: 'btn-agenda-cancel'
        },
        html: `
            <div class="reminder-form">
                <div class="agenda-form-group">
                    <label>Título (Opcional)</label>
                    <input type="text" id="event-title" class="agenda-input-styled" placeholder="Ej. Reunión Importante">
                </div>
                <div class="agenda-form-group">
                    <label>Contenido</label>
                    <textarea id="event-text" class="agenda-input-styled" placeholder="¿Qué tienes pendiente?" rows="3"></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="agenda-form-group">
                        <label>Tipo</label>
                        <select id="event-type" class="agenda-input-styled">
                            <option value="note">Nota Simple</option>
                            <option value="reminder">Recordatorio 🔔</option>
                        </select>
                    </div>
                    <div class="agenda-form-group">
                        <label>Categoría</label>
                        <select id="event-category" class="agenda-input-styled">
                            <option value="trabajo">Trabajo</option>
                            <option value="personal">Personal</option>
                            <option value="importante">Muy Importante</option>
                            <option value="finanzas">Finanzas</option>
                        </select>
                    </div>
                </div>

                <div id="reminder-options" style="display: none; flex-direction: column; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #ddd;">
                    <div class="agenda-form-group">
                        <label>Frecuencia de repetición</label>
                        <select id="reminder-freq" class="agenda-input-styled">
                            <option value="once">Solo una vez</option>
                            <option value="daily">Diariamente</option>
                            <option value="weekly">Semanalmente</option>
                            <option value="monthly">Mensualmente</option>
                        </select>
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#0B4E32',
        confirmButtonText: 'Guardar Evento',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            const typeSelect = document.getElementById('event-type');
            const reminderOpts = document.getElementById('reminder-options');
            typeSelect.onchange = () => {
                reminderOpts.style.display = typeSelect.value === 'reminder' ? 'flex' : 'none';
            };
        },
        preConfirm: () => {
            return {
                type: document.getElementById('event-type').value,
                title: document.getElementById('event-title').value,
                text: document.getElementById('event-text').value,
                category: document.getElementById('event-category').value,
                freq: document.getElementById('reminder-freq').value
            }
        }
    });

    if (formValues && formValues.text) {
        await saveAgendaNoteToDB({
            cell_id: cellId,
            type: formValues.type,
            title: formValues.title,
            text: formValues.text, 
            category: formValues.category,
            freq: formValues.freq,
            date: date,
            hour: hour
        });
    }
}

/**
 * Procesa recordatorios recurrentes para que aparezcan en las fechas futuras
 */
function processRecurrentReminders() {
    const newEntries = {};
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    // Filtrar solo los recordatorios recurrentes de la cache global
    const recurrentNotes = allAgendaData.filter(n => n.type === 'reminder' && n.freq !== 'once' && !n.is_quick_note);

    recurrentNotes.forEach(note => {
        const startDate = new Date(note.date + 'T12:00:00'); 
        
        const viewEnd = new Date(currentWeekStart);
        viewEnd.setDate(viewEnd.getDate() + 7);

        if (startDate < viewEnd) {
            for (let i = 0; i < 7; i++) {
                const checkDate = new Date(currentWeekStart);
                checkDate.setDate(checkDate.getDate() + i);
                checkDate.setHours(12,0,0,0);

                if (checkDate >= startDate) {
                    let shouldShow = false;
                    if (note.freq === 'daily') shouldShow = true;
                    if (note.freq === 'weekly' && checkDate.getDay() === startDate.getDay()) shouldShow = true;
                    if (note.freq === 'monthly' && checkDate.getDate() === startDate.getDate()) shouldShow = true;

                    if (shouldShow) {
                        const targetDateStr = checkDate.toISOString().split('T')[0];
                        const targetCellId = `${targetDateStr}-${note.hour}`;
                        
                        if (targetCellId !== note.cell_id) {
                            if (!window.tempReminders) window.tempReminders = {};
                            if (!window.tempReminders[targetCellId]) window.tempReminders[targetCellId] = [];
                            
                            const exists = window.tempReminders[targetCellId].some(r => r.text === note.text && r.hour === note.hour);
                            if (!exists) {
                                window.tempReminders[targetCellId].push({...note, isRecurrentInstance: true});
                            }
                        }
                    }
                }
            }
        }
    });
}

function getAgendaNotesCombined(cellId) {
    // Buscar en la cache global por cell_id
    let cellNotes = allAgendaData.filter(n => n.cell_id === cellId && !n.is_quick_note);
    
    // Combinar con recurrentes temporales
    if (window.tempReminders && window.tempReminders[cellId]) {
        const manualTexts = cellNotes.map(n => n.text);
        const recurrentToAdd = window.tempReminders[cellId].filter(r => !manualTexts.includes(r.text));
        return [...cellNotes, ...recurrentToAdd];
    }
    
    return cellNotes;
}

/**
 * Edita o elimina una nota existente
 */
async function editOrDeleteNote(id) {
    const note = allAgendaData.find(n => n.id === id);
    if (!note) return;

    if (note.isRecurrentInstance) {
        Swal.fire({
            icon: 'info',
            title: 'Recordatorio Recurrente',
            text: 'Para editar o eliminar este recordatorio, debes hacerlo desde su fecha original de creación.',
            confirmButtonColor: '#0B4E32'
        });
        return;
    }

    const result = await Swal.fire({
        title: 'Gestionar Evento',
        customClass: {
            popup: 'agenda-swal-custom',
            title: 'agenda-swal-title'
        },
        html: `
            <div class="reminder-form">
                <div class="agenda-form-group">
                    <label>Título (Opcional)</label>
                    <input type="text" id="event-title" class="agenda-input-styled" value="${note.title || ''}" placeholder="Ej. Reunión Importante">
                </div>
                <div class="agenda-form-group">
                    <label>Contenido del evento</label>
                    <textarea id="event-text" class="agenda-input-styled" rows="4">${note.text}</textarea>
                </div>
                <div class="agenda-form-group">
                    <label>Categoría</label>
                    <select id="event-category" class="agenda-input-styled">
                        <option value="trabajo" ${note.category === 'trabajo' ? 'selected' : ''}>Trabajo</option>
                        <option value="personal" ${note.category === 'personal' ? 'selected' : ''}>Personal</option>
                        <option value="importante" ${note.category === 'importante' ? 'selected' : ''}>Muy Importante</option>
                        <option value="finanzas" ${note.category === 'finanzas' ? 'selected' : ''}>Finanzas</option>
                    </select>
                </div>
                ${note.type === 'reminder' ? `
                <div class="agenda-form-group">
                    <label>Frecuencia</label>
                    <input class="agenda-input-styled" value="${note.freq}" disabled>
                </div>` : ''}
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#0B4E32',
        denyButtonColor: '#d33',
        confirmButtonText: 'Guardar Cambios',
        denyButtonText: 'Eliminar',
        cancelButtonText: 'Cerrar',
        preConfirm: () => {
            return {
                title: document.getElementById('event-title').value,
                text: document.getElementById('event-text').value,
                category: document.getElementById('event-category').value
            };
        }
    });

    if (result.isConfirmed) {
        if (result.value) {
            await saveAgendaNoteToDB({ ...note, ...result.value });
        }
    } else if (result.isDenied) {
        await saveAgendaNoteToDB(note, true);
    }
}

/**
 * Lógica de Notas Rápidas
 */
function getQuickNotes() {
    return allAgendaData.filter(n => n.is_quick_note === true);
}

async function saveQuickNoteToDB(note, isDelete = false) {
    const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!sb) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;

        if (isDelete) {
            await sb.from('ic_agenda').delete().eq('id', note.id);
        } else {
            const noteData = {
                ...note,
                user_id: session.user.id,
                is_quick_note: true
            };
            if (note.id) {
                await sb.from('ic_agenda').update(noteData).eq('id', note.id);
            } else {
                await sb.from('ic_agenda').insert([noteData]);
            }
        }
        await syncAgendaFromSupabase();
        renderQuickNotes();
    } catch (err) {
        console.error('Error al guardar nota rápida:', err);
    }
}

function renderQuickNotes() {
    const container = document.getElementById('quick-notes-container');
    if (!container) return;
    
    const notes = getQuickNotes();
    container.innerHTML = '';
    
    // Filtrar notas
    const filteredNotes = notes.filter(note => {
        // Filtrar por categoría
        const category = note.category || 'trabajo';
        if (!activeCategories.includes(category)) return false;

        // Filtrar por búsqueda
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            const text = (note.text || '').toLowerCase();
            if (!text.includes(q)) return false;
        }
        return true;
    });
    
    if (filteredNotes.length === 0) {
        const msg = searchQuery ? 'No se encontraron notas' : 'No hay notas rápidas';
        container.innerHTML = `<div class="no-notes-msg" style="padding: 1rem; color: #64748b; font-size: 0.85rem; text-align: center;">${msg}</div>`;
        return;
    }

    filteredNotes.forEach((note) => {
        const noteEl = document.createElement('div');
        noteEl.className = `quick-note-item cat-${note.category || 'trabajo'}`;
        noteEl.innerHTML = `
            <p>${note.text}</p>
            <div class="quick-note-actions">
                <button onclick="editQuickNote('${note.id}')"><i class="fas fa-edit"></i></button>
                <button onclick="deleteQuickNote('${note.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(noteEl);
    });
}

async function addQuickNote() {
    const { value: formValues } = await Swal.fire({
        title: 'Añadir Nota Rápida',
        html: `
            <textarea id="quick-note-text" class="agenda-input-styled" placeholder="Escribe algo..." rows="4"></textarea>
            <select id="quick-note-category" class="agenda-input-styled" style="margin-top: 10px; width: 100%;">
                <option value="trabajo">Trabajo</option>
                <option value="personal">Personal</option>
                <option value="importante">Importante</option>
                <option value="finanzas">Finanzas</option>
            </select>
        `,
        preConfirm: () => {
            return {
                text: document.getElementById('quick-note-text').value,
                category: document.getElementById('quick-note-category').value
            }
        }
    });

    if (formValues && formValues.text) {
        await saveQuickNoteToDB({
            text: formValues.text,
            category: formValues.category
        });
    }
}

async function editQuickNote(id) {
    const note = allAgendaData.find(n => n.id === id);
    if (!note) return;

    const { value: formValues } = await Swal.fire({
        title: 'Editar Nota Rápida',
        html: `
            <textarea id="quick-note-text" class="agenda-input-styled" rows="4">${note.text}</textarea>
            <select id="quick-note-category" class="agenda-input-styled" style="margin-top: 10px; width: 100%;">
                <option value="trabajo" ${note.category === 'trabajo' ? 'selected' : ''}>Trabajo</option>
                <option value="personal" ${note.category === 'personal' ? 'selected' : ''}>Personal</option>
                <option value="importante" ${note.category === 'importante' ? 'selected' : ''}>Importante</option>
                <option value="finanzas" ${note.category === 'finanzas' ? 'selected' : ''}>Finanzas</option>
            </select>
        `,
        preConfirm: () => {
            return {
                text: document.getElementById('quick-note-text').value,
                category: document.getElementById('quick-note-category').value
            }
        }
    });

    if (formValues && formValues.text) {
        await saveQuickNoteToDB({ ...note, ...formValues });
    }
}

async function deleteQuickNote(id) {
    const note = allAgendaData.find(n => n.id === id);
    if (!note) return;
    
    const result = await Swal.fire({
        title: '¿Eliminar nota?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        await saveQuickNoteToDB(note, true);
    }
}

/**
 * Indicador de tiempo actual
 */
let timeIndicatorInterval;

function startTimeIndicator() {
    updateTimeIndicator();
    timeIndicatorInterval = setInterval(updateTimeIndicator, 60000); // Actualizar cada minuto
}

function stopTimeIndicator() {
    clearInterval(timeIndicatorInterval);
}

function updateTimeIndicator() {
    const indicator = document.getElementById('current-time-indicator');
    if (!indicator) return;

    const now = new Date();
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    // Calcular si hoy está dentro de la semana visible
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const isThisWeek = now >= currentWeekStart && now < weekEnd;
    
    if (!isThisWeek) {
        indicator.style.display = 'none';
        return;
    }

    // Calcular dayIdx relativo a currentWeekStart
    const startObj = new Date(currentWeekStart);
    startObj.setHours(0,0,0,0);
    const todayObj = new Date(now);
    todayObj.setHours(0,0,0,0);
    const dayIdx = Math.round((todayObj - startObj) / (24 * 60 * 60 * 1000));
    
    const hour = now.getHours();
    const minutes = now.getMinutes();

    if (hour < 7 || hour > 22) {
        indicator.style.display = 'none';
        return;
    }

    indicator.style.display = 'block';
    
    // Calcular posiciones
    const grid = document.getElementById('agenda-grid');
    if (!grid) return;
    const gridWidth = grid.offsetWidth;
    const dayWidth = (gridWidth - 80) / 7;
    
    const top = 50 + (hour - 7) * 80 + (minutes / 60) * 80;
    const left = 80 + dayIdx * dayWidth;
    
    indicator.style.top = `${top}px`;
    indicator.style.left = `${left}px`;
    indicator.style.width = `${dayWidth}px`;
}

/**
 * Obtiene las notas de la cache global
 */
function getAgendaNotes(cellId) {
    return getAgendaNotesCombined(cellId);
}

/**
 * Guarda o elimina una nota en Supabase
 */
async function saveAgendaNoteToDB(note, isDelete = false) {
    const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!sb) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;

        if (isDelete) {
            if (note.id) {
                const { error } = await sb.from('ic_agenda').delete().eq('id', note.id);
                if (error) throw error;
            }
        } else {
            const noteData = {
                cell_id: note.cell_id,
                type: note.type,
                title: note.title,
                text: note.text,
                category: note.category,
                freq: note.freq,
                date: note.date,
                hour: note.hour,
                is_quick_note: note.is_quick_note || false,
                user_id: session.user.id
            };

            if (note.id) {
                const { error } = await sb.from('ic_agenda').update(noteData).eq('id', note.id);
                if (error) throw error;
            } else {
                const { error } = await sb.from('ic_agenda').insert([noteData]);
                if (error) throw error;
            }
        }
        
        await syncAgendaFromSupabase();
        renderAgenda();
        if (searchQuery) renderGlobalSearchResults();
    } catch (err) {
        console.error('Error en operación de DB:', err);
        Swal.fire('Error', 'No se pudo guardar en la base de datos', 'error');
    }
}

// Inicializar listeners de navegación
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    const datePickerBtn = document.getElementById('agenda-datepicker-btn');
    const dateInput = document.getElementById('agenda-date-input');
    
    if (prevBtn) prevBtn.onclick = prevWeek;
    if (nextBtn) nextBtn.onclick = nextWeek;

    if (datePickerBtn && dateInput) {
        datePickerBtn.onclick = () => dateInput.showPicker();
        dateInput.onchange = (e) => {
            if (e.target.value) {
                const selectedDate = new Date(e.target.value + 'T00:00:00');
                currentWeekStart = selectedDate;
                renderAgenda();
                // Limpiar el valor para permitir seleccionar la misma fecha nuevamente
                e.target.value = '';
            }
        };
    }

    // Cerrar modal al hacer click fuera del card
    const modal = document.getElementById('agenda-modal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeAgendaModal();
        };
    }
    
    // Listener para filtros de categoría
    const filterContainer = document.querySelector('.category-filters');
    if (filterContainer) {
        filterContainer.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT') {
                const category = e.target.dataset.category;
                if (e.target.checked) {
                    if (!activeCategories.includes(category)) activeCategories.push(category);
                } else {
                    activeCategories = activeCategories.filter(c => c !== category);
                }
                renderAgenda();
            }
        });
    }

    window.addEventListener('resize', updateTimeIndicator);
});

// Exponer funciones globalmente
window.openAgendaModal = openAgendaModal;
window.closeAgendaModal = closeAgendaModal;
window.handleAgendaSearch = handleAgendaSearch;
window.goToToday = goToToday;
window.addQuickNote = addQuickNote;
window.editQuickNote = editQuickNote;
window.deleteQuickNote = deleteQuickNote;

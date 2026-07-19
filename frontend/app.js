// FUME Client Intelligence Dashboard Logic

// Global application state
let appState = {
    transcript: [],
    analysis: null,
    editingCardId: null // tracks which card is currently in edit mode
};

// DOM elements
const transcriptContainer = document.getElementById('transcript-container');
const transcriptSearch = document.getElementById('transcript-search');
const reanalyzeBtn = document.getElementById('reanalyze-btn');
const exportBtn = document.getElementById('export-btn');
const reviewProgress = document.getElementById('review-progress');
const statusBanner = document.getElementById('status-banner');
const dataSourceLabel = document.getElementById('data-source-label');
const dataSourceDesc = document.getElementById('data-source-desc');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const toastIcon = document.getElementById('toast-icon');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Load raw transcript
    await loadTranscript();
    
    // Automatically trigger initial analysis
    await runAnalysis();
    
    // Event listeners
    reanalyzeBtn.addEventListener('click', runAnalysis);
    exportBtn.addEventListener('click', exportReviewedData);
    transcriptSearch.addEventListener('input', filterTranscript);
});

// Toast notification helper
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    if (type === 'success') {
        toastIcon.className = 'fa-solid fa-check-circle text-success';
        toast.style.borderLeft = '4px solid var(--color-success)';
    } else {
        toastIcon.className = 'fa-solid fa-triangle-exclamation text-danger';
        toast.style.borderLeft = '4px solid var(--color-danger)';
    }
    
    // Hide toast after 4 seconds
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// 1. Fetch & Render Conversation Transcript
async function loadTranscript() {
    try {
        const response = await fetch('/api/transcript');
        if (!response.ok) throw new Error('Failed to fetch transcript');
        
        appState.transcript = await response.json();
        renderTranscript(appState.transcript);
    } catch (error) {
        console.error(error);
        transcriptContainer.innerHTML = `
            <div class="loading-state">
                <i class="fa-solid fa-circle-xmark text-danger" style="font-size: 32px;"></i>
                <p>Error loading transcript: ${error.message}</p>
            </div>
        `;
    }
}

function renderTranscript(lines) {
    if (lines.length === 0) {
        transcriptContainer.innerHTML = '<p class="text-secondary text-center">No transcript available.</p>';
        return;
    }
    
    transcriptContainer.innerHTML = lines.map(line => {
        if (line.is_header) {
            return `<div class="transcript-line day-header" data-id="${line.id}">${line.text}</div>`;
        }
        
        let speakerClass = '';
        if (line.speaker === 'Client') speakerClass = 'speaker-client';
        else if (line.speaker === 'Coach') speakerClass = 'speaker-coach';
        else if (line.speaker === 'Accountability Coach') speakerClass = 'speaker-accountability';
        
        return `
            <div class="transcript-line ${speakerClass}" data-id="${line.id}">
                <strong>${line.speaker}:</strong> ${escapeHtml(line.text)}
            </div>
        `;
    }).join('');
}

// Search filter for transcript
function filterTranscript() {
    const query = transcriptSearch.value.toLowerCase();
    const filtered = appState.transcript.filter(line => 
        line.text.toLowerCase().includes(query) || 
        (line.speaker && line.speaker.toLowerCase().includes(query))
    );
    renderTranscript(filtered);
}

// 2. Fetch & Process Client Intelligence Report
async function runAnalysis() {
    setLoadingState();
    
    try {
        const response = await fetch('/api/analyze', { method: 'POST' });
        if (!response.ok) throw new Error('Analysis request failed');
        
        const result = await response.json();
        appState.analysis = result.data;
        
        // Update status banner based on API mode
        updateStatusBanner(result.source, result.error_details);
        
        // Render dashboard sections
        renderDashboard();
        
        showToast('Intelligence analysis completed.');
    } catch (error) {
        console.error(error);
        showToast('Analysis failed: ' + error.message, 'error');
        clearLoadingState(error.message);
    }
}

function updateStatusBanner(source, errorDetails) {
    statusBanner.className = 'status-banner';
    
    if (source === 'gemini_live') {
        statusBanner.classList.add('success');
        dataSourceLabel.textContent = 'Live Analysis - Gemini 1.5 Flash';
        dataSourceDesc.textContent = 'Structured client intelligence extracted in real-time from conversation history.';
    } else if (source === 'mock_fallback') {
        statusBanner.classList.add('info');
        dataSourceLabel.textContent = 'Offline Demo Mode (mock_analysis.json)';
        dataSourceDesc.textContent = 'No GEMINI_API_KEY environment variable detected. Running on local cached high-fidelity data.';
    } else {
        statusBanner.classList.add('info');
        dataSourceLabel.textContent = 'API Error Fallback Mode';
        dataSourceDesc.textContent = `Gemini call failed, fell back to mock data. Error: ${errorDetails || 'Unknown'}`;
    }
}

function setLoadingState() {
    reanalyzeBtn.disabled = true;
    reanalyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
    
    const loader = `
        <div class="loading-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Analyzing conversation text...</p>
        </div>
    `;
    
    document.getElementById('weekly-summary-card').innerHTML = loader;
    document.getElementById('metrics-grid').innerHTML = loader;
    document.getElementById('risks-container').innerHTML = loader;
    document.getElementById('recommendations-container').innerHTML = loader;
    document.getElementById('pending-actions-container').innerHTML = loader;
}

function clearLoadingState(errMsg) {
    reanalyzeBtn.disabled = false;
    reanalyzeBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Analyze Transcript';
    
    const errorHTML = `
        <div class="loading-state">
            <i class="fa-solid fa-circle-xmark text-danger"></i>
            <p>Failed: ${escapeHtml(errMsg)}</p>
        </div>
    `;
    
    document.getElementById('weekly-summary-card').innerHTML = errorHTML;
    document.getElementById('metrics-grid').innerHTML = errorHTML;
}

// 3. Render Dashboard Elements
function renderDashboard() {
    reanalyzeBtn.disabled = false;
    reanalyzeBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Analyze Transcript';
    
    renderWeeklySummary();
    renderMetrics();
    renderRisks();
    renderRecommendations();
    renderPendingActions();
    
    updateReviewProgress();
}

// Render Weekly Summary
function renderWeeklySummary() {
    const cardEl = document.getElementById('weekly-summary-card');
    const data = appState.analysis.weekly_summary;
    const cardId = 'weekly_summary';
    
    cardEl.className = `summary-card ${data.review_status.toLowerCase()}`;
    
    if (appState.editingCardId === cardId) {
        cardEl.innerHTML = renderEditForm(cardId, data, false);
    } else {
        cardEl.innerHTML = `
            <div class="card-header">
                <span class="confidence-badge ${getConfidenceClass(data.confidence)}">
                    <i class="fa-solid fa-circle-nodes"></i> ${data.confidence}
                </span>
                <span class="status-badge status-${data.review_status.toLowerCase()}">${data.review_status}</span>
            </div>
            <p class="card-content-text" style="font-size: 15px; margin: 12px 0;">${escapeHtml(data.value)}</p>
            ${renderGroundingBox(data)}
            <div class="card-actions">
                <button class="btn btn-secondary btn-sm" onclick="toggleEdit('${cardId}')">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm text-danger" onclick="updateStatus('${cardId}', 'Rejected')">
                    <i class="fa-solid fa-xmark"></i> Reject
                </button>
                <button class="btn btn-primary btn-sm text-success" style="background-color: var(--color-success-bg); border-color: var(--color-success-border);" onclick="updateStatus('${cardId}', 'Approved')">
                    <i class="fa-solid fa-check"></i> Approve
                </button>
            </div>
        `;
    }
}

// Render Metrics Grid
function renderMetrics() {
    const gridEl = document.getElementById('metrics-grid');
    const categories = appState.analysis.categories;
    
    let html = '';
    for (const [key, data] of Object.entries(categories)) {
        const cardId = `category_${key}`;
        const isEditing = appState.editingCardId === cardId;
        const icon = getMetricIcon(key);
        const displayName = getMetricDisplayName(key);
        
        html += `
            <div class="card ${data.review_status.toLowerCase()}" id="card-${cardId}">
                <div class="card-header">
                    <div class="card-title">
                        <i class="${icon}"></i>
                        <span>${displayName}</span>
                    </div>
                    <span class="status-badge status-${data.review_status.toLowerCase()}">${data.review_status}</span>
                </div>
        `;
        
        if (isEditing) {
            html += renderEditForm(cardId, data);
        } else {
            html += `
                <p class="card-content-text">${escapeHtml(data.value)}</p>
                <div class="meta-row">
                    <span class="confidence-badge ${getConfidenceClass(data.confidence)}">
                        <i class="fa-solid fa-circle-nodes"></i> ${data.confidence}
                    </span>
                </div>
                ${renderGroundingBox(data)}
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="toggleEdit('${cardId}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm text-danger" onclick="updateStatus('${cardId}', 'Rejected')">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                    <button class="btn btn-primary btn-sm text-success" style="background-color: var(--color-success-bg); border-color: var(--color-success-border);" onclick="updateStatus('${cardId}', 'Approved')">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                </div>
            `;
        }
        
        html += `</div>`;
    }
    
    gridEl.innerHTML = html;
}

// Render Risks
function renderRisks() {
    const container = document.getElementById('risks-container');
    const risks = appState.analysis.risk_flags;
    
    if (!risks || risks.length === 0) {
        container.innerHTML = '<p class="text-secondary">No risk flags generated.</p>';
        return;
    }
    
    container.innerHTML = risks.map((risk, index) => {
        const cardId = `risk_${index}`;
        const isEditing = appState.editingCardId === cardId;
        
        let html = `
            <div class="risk-card ${risk.review_status.toLowerCase()}" style="border-left-color: ${getSeverityColor(risk.severity)}">
                <div class="risk-header">
                    <div class="risk-title">
                        <i class="fa-solid fa-triangle-exclamation text-danger"></i>
                        <span>Risk #${index + 1}</span>
                        <span class="severity-badge severity-${risk.severity.toLowerCase()}">${risk.severity} Severity</span>
                    </div>
                    <span class="status-badge status-${risk.review_status.toLowerCase()}">${risk.review_status}</span>
                </div>
        `;
        
        if (isEditing) {
            html += renderEditForm(cardId, risk, true, true);
        } else {
            html += `
                <p class="card-content-text text-bold" style="font-size: 14px;">${escapeHtml(risk.description)}</p>
                <div class="meta-row">
                    <span class="confidence-badge ${getConfidenceClass(risk.confidence)}">
                        <i class="fa-solid fa-circle-nodes"></i> ${risk.confidence}
                    </span>
                </div>
                ${renderGroundingBox(risk)}
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="toggleEdit('${cardId}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm text-danger" onclick="updateStatus('${cardId}', 'Rejected')">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                    <button class="btn btn-primary btn-sm text-success" style="background-color: var(--color-success-bg); border-color: var(--color-success-border);" onclick="updateStatus('${cardId}', 'Approved')">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                </div>
            `;
        }
        
        html += `</div>`;
        return html;
    }).join('');
}

// Render Recommendations
function renderRecommendations() {
    const container = document.getElementById('recommendations-container');
    const rec = appState.analysis.recommended_next_action;
    const cardId = 'recommendation';
    const isEditing = appState.editingCardId === cardId;
    
    container.innerHTML = `
        <div class="card rec-card ${rec.review_status.toLowerCase()}">
            <div class="card-header">
                <div class="card-title">
                    <i class="fa-solid fa-wand-magic-sparkles text-accent"></i>
                    <span>Coach Strategy Recommendation</span>
                </div>
                <span class="status-badge status-${rec.review_status.toLowerCase()}">${rec.review_status}</span>
            </div>
    `;
    
    const cardBody = document.querySelector('#recommendations-container .card');
    
    if (isEditing) {
        container.querySelector('.card').innerHTML += renderEditForm(cardId, rec, false, false, true);
    } else {
        container.querySelector('.card').innerHTML += `
            <div class="card-content-text">
                <p style="font-weight: 600; font-size: 14.5px; color: var(--color-primary); margin-bottom: 6px;">
                    ${escapeHtml(rec.action_text)}
                </p>
                <p style="color: var(--text-secondary); font-size: 13px;">
                    <strong>Rationale:</strong> ${escapeHtml(rec.rationale)}
                </p>
            </div>
            ${renderGroundingBox(rec)}
            <div class="card-actions">
                <button class="btn btn-secondary btn-sm" onclick="toggleEdit('${cardId}')">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm text-danger" onclick="updateStatus('${cardId}', 'Rejected')">
                    <i class="fa-solid fa-xmark"></i> Reject
                </button>
                <button class="btn btn-primary btn-sm text-success" style="background-color: var(--color-success-bg); border-color: var(--color-success-border);" onclick="updateStatus('${cardId}', 'Approved')">
                    <i class="fa-solid fa-check"></i> Approve
                </button>
            </div>
        `;
    }
    
    container.innerHTML += `</div>`;
}

// Render Pending Actions Tracker
function renderPendingActions() {
    const container = document.getElementById('pending-actions-container');
    const actions = appState.analysis.pending_actions;
    
    if (!actions || actions.length === 0) {
        container.innerHTML = '<p class="text-secondary">No pending actions generated.</p>';
        return;
    }
    
    container.innerHTML = actions.map((action, index) => {
        const cardId = `action_${index}`;
        const isEditing = appState.editingCardId === cardId;
        
        let html = `
            <div class="card action-card ${action.review_status.toLowerCase()}">
                <div class="card-header">
                    <span class="assignee-badge">
                        <i class="fa-regular fa-user"></i> Assigned to: ${action.assigned_to}
                    </span>
                    <span class="status-badge status-${action.review_status.toLowerCase()}">${action.review_status}</span>
                </div>
        `;
        
        if (isEditing) {
            html += renderEditForm(cardId, action, true, false, false, true);
        } else {
            html += `
                <p class="card-content-text" style="font-weight: 500;">${escapeHtml(action.action_text)}</p>
                <div class="meta-row">
                    <span class="confidence-badge ${getConfidenceClass(action.confidence)}">
                        <i class="fa-solid fa-circle-nodes"></i> ${action.confidence}
                    </span>
                </div>
                ${renderGroundingBox(action)}
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="toggleEdit('${cardId}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm text-danger" onclick="updateStatus('${cardId}', 'Rejected')">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                    <button class="btn btn-primary btn-sm text-success" style="background-color: var(--color-success-bg); border-color: var(--color-success-border);" onclick="updateStatus('${cardId}', 'Approved')">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                </div>
            `;
        }
        
        html += `</div>`;
        return html;
    }).join('');
}

// 4. Grounding & Highlight Utilities
function renderGroundingBox(item) {
    if (!item.evidence_quote) return '';
    
    const warningBadge = !item.grounded 
        ? `<span class="grounding-warning"><i class="fa-solid fa-circle-exclamation"></i> Grounding Warning</span>` 
        : '';
        
    return `
        <div class="grounding-box" onclick="highlightEvidence([${item.matched_line_ids ? item.matched_line_ids.join(',') : ''}])">
            <div class="grounding-title">
                <span><i class="fa-solid fa-quote-left"></i> Evidence Quote</span>
                ${warningBadge}
            </div>
            <p>"${escapeHtml(item.evidence_quote)}"</p>
        </div>
    `;
}

function highlightEvidence(lineIds) {
    // Clear previous highlights
    document.querySelectorAll('.transcript-line').forEach(el => {
        el.classList.remove('highlighted');
    });
    
    if (!lineIds || lineIds.length === 0) return;
    
    // Highlight lines
    lineIds.forEach(id => {
        const lineEl = document.querySelector(`.transcript-line[data-id="${id}"]`);
        if (lineEl) {
            lineEl.classList.add('highlighted');
        }
    });
    
    // Scroll the first matched line into view
    const firstLineEl = document.querySelector(`.transcript-line[data-id="${lineIds[0]}"]`);
    if (firstLineEl) {
        firstLineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// 5. Card Edit Form Generator
function renderEditForm(cardId, data, isListElement = false, isRisk = false, isRec = false, isAction = false) {
    const confidences = ['Confirmed Fact', 'Client-Reported', 'AI Inference', 'Missing / Unavailable'];
    
    let confidenceOptions = confidences.map(c => 
        `<option value="${c}" ${data.confidence === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    
    let editFieldsHTML = '';
    
    if (isRisk) {
        editFieldsHTML = `
            <div class="form-group">
                <label>Risk Description</label>
                <input type="text" id="edit-val-${cardId}" class="edit-input" value="${escapeHtml(data.description)}">
            </div>
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label>Severity</label>
                    <select id="edit-severity-${cardId}" class="edit-select">
                        <option value="High" ${data.severity === 'High' ? 'selected' : ''}>High</option>
                        <option value="Medium" ${data.severity === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="Low" ${data.severity === 'Low' ? 'selected' : ''}>Low</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Confidence Type</label>
                    <select id="edit-conf-${cardId}" class="edit-select">${confidenceOptions}</select>
                </div>
            </div>
        `;
    } else if (isRec) {
        editFieldsHTML = `
            <div class="form-group">
                <label>Action Strategy</label>
                <textarea id="edit-val-${cardId}" class="edit-textarea">${escapeHtml(data.action_text)}</textarea>
            </div>
            <div class="form-group">
                <label>Rationale</label>
                <textarea id="edit-rationale-${cardId}" class="edit-textarea">${escapeHtml(data.rationale)}</textarea>
            </div>
            <input type="hidden" id="edit-conf-${cardId}" value="AI Inference">
        `;
    } else if (isAction) {
        editFieldsHTML = `
            <div class="form-group">
                <label>Action Item</label>
                <input type="text" id="edit-val-${cardId}" class="edit-input" value="${escapeHtml(data.action_text)}">
            </div>
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label>Assigned To</label>
                    <select id="edit-assigned-${cardId}" class="edit-select">
                        <option value="Client" ${data.assigned_to === 'Client' ? 'selected' : ''}>Client</option>
                        <option value="Coach" ${data.assigned_to === 'Coach' ? 'selected' : ''}>Coach</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Confidence Type</label>
                    <select id="edit-conf-${cardId}" class="edit-select">${confidenceOptions}</select>
                </div>
            </div>
        `;
    } else {
        editFieldsHTML = `
            <div class="form-group">
                <label>Extracted Value / Text</label>
                <textarea id="edit-val-${cardId}" class="edit-textarea">${escapeHtml(data.value)}</textarea>
            </div>
            <div class="form-group">
                <label>Confidence Type</label>
                <select id="edit-conf-${cardId}" class="edit-select">${confidenceOptions}</select>
            </div>
        `;
    }
    
    return `
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;" class="edit-form">
            ${editFieldsHTML}
            <div class="form-group">
                <label>Supporting Evidence Quote</label>
                <textarea id="edit-quote-${cardId}" class="edit-textarea" style="min-height: 50px;">${escapeHtml(data.evidence_quote)}</textarea>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
                <button class="btn btn-secondary btn-sm" onclick="toggleEdit(null)">Cancel</button>
                <button class="btn btn-primary btn-sm" onclick="saveEdit('${cardId}')">Save Changes</button>
            </div>
        </div>
    `;
}

// 6. Action Handlers (Approve / Reject / Edit / Save)
function toggleEdit(cardId) {
    appState.editingCardId = cardId;
    renderDashboard();
}

function updateStatus(cardId, newStatus) {
    const item = getItemFromState(cardId);
    if (item) {
        item.review_status = newStatus;
        renderDashboard();
        showToast(`Item status updated to: ${newStatus}`);
    }
}

async function saveEdit(cardId) {
    const item = getItemFromState(cardId);
    if (!item) return;
    
    // Retrieve forms values
    const quoteVal = document.getElementById(`edit-quote-${cardId}`).value;
    const confVal = document.getElementById(`edit-conf-${cardId}`).value;
    
    if (cardId.startsWith('risk_')) {
        item.description = document.getElementById(`edit-val-${cardId}`).value;
        item.severity = document.getElementById(`edit-severity-${cardId}`).value;
    } else if (cardId === 'recommendation') {
        item.action_text = document.getElementById(`edit-val-${cardId}`).value;
        item.rationale = document.getElementById(`edit-rationale-${cardId}`).value;
    } else if (cardId.startsWith('action_')) {
        item.action_text = document.getElementById(`edit-val-${cardId}`).value;
        item.assigned_to = document.getElementById(`edit-assigned-${cardId}`).value;
    } else {
        item.value = document.getElementById(`edit-val-${cardId}`).value;
    }
    
    item.evidence_quote = quoteVal;
    item.confidence = confVal;
    
    // Perform instant client-side grounding recalculation for better feedback
    const transcriptText = appState.transcript.map(t => t.text).join('\n');
    const check = verifyQuoteGroundingLocal(quoteVal, transcriptText);
    item.grounded = check.grounded;
    item.grounding_warning = check.warning;
    item.matched_line_ids = mapQuoteToLinesLocal(quoteVal, appState.transcript);
    
    // Force status to Approved when edited manually
    item.review_status = 'Approved';
    
    // Turn off edit mode
    appState.editingCardId = null;
    renderDashboard();
    
    showToast('Changes saved and marked as Approved.');
}

// Local helper to re-evaluate quote matches in frontend
function verifyQuoteGroundingLocal(quote, transcript) {
    if (!quote || quote.trim() === "") return { grounded: true, warning: "" };
    
    const normalize = t => t.toLowerCase().replace(/[.,;:!?"'()\[\]{}]/g, '').replace(/\s+/g, ' ');
    const normTranscript = normalize(transcript);
    const parts = quote.split('...').map(p => p.trim()).filter(p => p.length > 0);
    
    const unmatched = [];
    for (const part of parts) {
        if (part.length < 4) continue;
        if (!normTranscript.includes(normalize(part))) {
            unmatched.push(part);
        }
    }
    
    if (unmatched.length > 0) {
        return {
            grounded: false,
            warning: `Ungrounded quote segment: "${unmatched[0]}"`
        };
    }
    return { grounded: true, warning: "" };
}

function mapQuoteToLinesLocal(quote, transcriptLines) {
    if (!quote || quote.trim() === "") return [];
    
    const normalize = t => t.toLowerCase().replace(/[.,;:!?"'()\[\]{}]/g, '').replace(/\s+/g, ' ');
    const parts = quote.split('...').map(p => p.trim()).filter(p => p.length > 0);
    const matchedIds = [];
    
    transcriptLines.forEach(line => {
        if (line.is_header) return;
        const normLine = normalize(line.text);
        parts.forEach(part => {
            if (part.length < 4) return;
            if (normLine.includes(normalize(part))) {
                matchedIds.push(line.id);
            }
        });
    });
    
    return [...new Set(matchedIds)];
}

// Find item reference in appState using cardId string
function getItemFromState(cardId) {
    if (cardId === 'weekly_summary') {
        return appState.analysis.weekly_summary;
    } else if (cardId.startsWith('category_')) {
        const key = cardId.replace('category_', '');
        return appState.analysis.categories[key];
    } else if (cardId.startsWith('risk_')) {
        const idx = parseInt(cardId.replace('risk_', ''));
        return appState.analysis.risk_flags[idx];
    } else if (cardId === 'recommendation') {
        return appState.analysis.recommended_next_action;
    } else if (cardId.startsWith('action_')) {
        const idx = parseInt(cardId.replace('action_', ''));
        return appState.analysis.pending_actions[idx];
    }
    return null;
}

// 7. Save reviewed report back to database
async function exportReviewedData() {
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.analysis)
        });
        
        if (!response.ok) throw new Error('Save endpoint returned an error');
        
        showToast('Reviewed client intelligence saved to reviewed_analysis.json.');
    } catch (error) {
        console.error(error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

// 8. Meta Helpers
function updateReviewProgress() {
    if (!appState.analysis) return;
    
    let totalItems = 0;
    let approvedItems = 0;
    
    // Count items
    const countItem = (item) => {
        totalItems++;
        if (item.review_status === 'Approved') approvedItems++;
    };
    
    countItem(appState.analysis.weekly_summary);
    
    Object.values(appState.analysis.categories).forEach(countItem);
    
    if (appState.analysis.risk_flags) {
        appState.analysis.risk_flags.forEach(countItem);
    }
    
    countItem(appState.analysis.recommended_next_action);
    
    if (appState.analysis.pending_actions) {
        appState.analysis.pending_actions.forEach(countItem);
    }
    
    reviewProgress.textContent = `Review progress: ${approvedItems}/${totalItems} items approved`;
}

// Class helper mappings
function getConfidenceClass(conf) {
    switch (conf) {
        case 'Confirmed Fact': return 'confidence-confirmed';
        case 'Client-Reported': return 'confidence-reported';
        case 'AI Inference': return 'confidence-inference';
        case 'Missing / Unavailable': return 'confidence-missing';
        default: return '';
    }
}

function getSeverityColor(sev) {
    switch (sev) {
        case 'High': return 'var(--color-danger)';
        case 'Medium': return 'var(--color-warning)';
        case 'Low': return 'var(--color-info)';
        default: return 'var(--border-color)';
    }
}

function getMetricIcon(key) {
    switch (key) {
        case 'nutrition_adherence': return 'fa-solid fa-apple-whole text-accent';
        case 'exercise_steps': return 'fa-solid fa-shoe-prints text-accent';
        case 'sleep': return 'fa-solid fa-moon text-accent';
        case 'water_intake': return 'fa-solid fa-droplet text-accent';
        case 'symptoms_stress': return 'fa-solid fa-heart-pulse text-accent';
        case 'engagement_level': return 'fa-solid fa-handshake-angle text-accent';
        case 'key_barriers': return 'fa-solid fa-ban text-accent';
        default: return 'fa-solid fa-circle text-accent';
    }
}

function getMetricDisplayName(key) {
    return key
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

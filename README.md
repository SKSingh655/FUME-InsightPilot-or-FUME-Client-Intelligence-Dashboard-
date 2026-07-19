# FUME GenAI Client Intelligence Platform - Prototype Documentation

This repository contains the prototype and engineering documentation for the **FUME GenAI Client Intelligence Dashboard**, built for the GenAI Product Intern assignment.

## 1. What was Built (Architecture Overview)

We have built a **Human-in-the-Loop Client Intelligence Dashboard**. It consists of:
1. **Python FastAPI Backend (`app.py`)**:
   - Parses the unstructured 8-day client-coach conversation transcript.
   - Coordinates the GenAI analysis using the **Gemini 1.5 Flash** model with strict Pydantic JSON schema formatting.
   - Implements a **Verbatim Grounding Validator** that splits and verifies if LLM-extracted evidence quotes exist exactly in the source text.
   - Maps evidence quotes to specific line numbers in the raw transcript.
   - Serves as a static server for the frontend, with a cached **offline fallback mode (`mock_analysis.json`)** to ensure evaluators can run the prototype immediately without configuring API keys.
2. **Responsive Single Page Application (`frontend/`)**:
   - **Interactive Transcript panel (left)**: Displays the dialogue color-coded by speaker. Clicking on a metric card's evidence quote instantly highlights and scrolls to the exact dialogue line in this panel.
   - **Review workspace (right)**: Displays Weekly Summary, core structured metrics (Nutrition, Sleep, Water, Steps, Symptoms/Stress, Barriers, Engagement), Risk Flags, and Recommendations.
   - **Human-in-the-Loop review actions**: The coach can **Approve**, **Reject**, or inline **Edit** any value, confidence classification, or evidence quote. Toggling "Edit" reveals instant update controls.
   - **Export capabilities**: Saves the reviewed, coach-approved data to `reviewed_analysis.json` in the workspace.

---

## 2. Structured Output JSON Schema

Each intelligence metric is structured into a strict object containing its value, source confidence classification, supporting evidence quote, and review status.

Here is the JSON schema representing the extracted intelligence structure:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClientIntelligenceReport",
  "type": "object",
  "properties": {
    "weekly_summary": {
      "type": "object",
      "properties": {
        "value": { "type": "string", "description": "High-level progress synthesis." },
        "confidence": { "type": "string", "enum": ["Confirmed Fact", "Client-Reported", "AI Inference", "Missing / Unavailable"] },
        "evidence_quote": { "type": "string", "description": "Verbatim quote(s) from transcript." },
        "review_status": { "type": "string", "enum": ["Pending", "Approved", "Rejected"] }
      },
      "required": ["value", "confidence", "evidence_quote", "review_status"]
    },
    "categories": {
      "type": "object",
      "properties": {
        "nutrition_adherence": { "$ref": "#/definitions/IntelligenceItem" },
        "exercise_steps": { "$ref": "#/definitions/IntelligenceItem" },
        "sleep": { "$ref": "#/definitions/IntelligenceItem" },
        "water_intake": { "$ref": "#/definitions/IntelligenceItem" },
        "symptoms_stress": { "$ref": "#/definitions/IntelligenceItem" },
        "engagement_level": { "$ref": "#/definitions/IntelligenceItem" },
        "key_barriers": { "$ref": "#/definitions/IntelligenceItem" }
      },
      "required": [
        "nutrition_adherence", "exercise_steps", "sleep", "water_intake", 
        "symptoms_stress", "engagement_level", "key_barriers"
      ]
    },
    "risk_flags": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": { "type": "string" },
          "severity": { "type": "string", "enum": ["Low", "Medium", "High"] },
          "confidence": { "type": "string", "enum": ["Confirmed Fact", "Client-Reported", "AI Inference", "Missing / Unavailable"] },
          "evidence_quote": { "type": "string" },
          "review_status": { "type": "string", "enum": ["Pending", "Approved", "Rejected"] }
        },
        "required": ["description", "severity", "confidence", "evidence_quote", "review_status"]
      }
    },
    "recommended_next_action": {
      "type": "object",
      "properties": {
        "action_text": { "type": "string" },
        "rationale": { "type": "string" },
        "confidence": { "type": "string", "enum": ["AI Inference"] },
        "evidence_quote": { "type": "string" },
        "review_status": { "type": "string", "enum": ["Pending", "Approved", "Rejected"] }
      },
      "required": ["action_text", "rationale", "confidence", "evidence_quote", "review_status"]
    },
    "pending_actions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "action_text": { "type": "string" },
          "assigned_to": { "type": "string", "enum": ["Coach", "Client"] },
          "confidence": { "type": "string", "enum": ["Confirmed Fact", "Client-Reported", "AI Inference", "Missing / Unavailable"] },
          "evidence_quote": { "type": "string" },
          "review_status": { "type": "string", "enum": ["Pending", "Approved", "Rejected"] }
        },
        "required": ["action_text", "assigned_to", "confidence", "evidence_quote", "review_status"]
      }
    }
  },
  "required": ["weekly_summary", "categories", "risk_flags", "recommended_next_action", "pending_actions"],
  
  "definitions": {
    "IntelligenceItem": {
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "confidence": { "type": "string", "enum": ["Confirmed Fact", "Client-Reported", "AI Inference", "Missing / Unavailable"] },
        "evidence_quote": { "type": "string" },
        "review_status": { "type": "string", "enum": ["Pending", "Approved", "Rejected"] }
      },
      "required": ["value", "confidence", "evidence_quote", "review_status"]
    }
  }
}
```

---

## 3. The Prompting & Analysis Workflow

A naive LLM prompt asking for a summary often summarizes without citing, or invents quotes (hallucinations). Our workflow combats this through a **highly structured system instruction** and a **post-extraction validation pipeline**.

### System Instruction Configuration
The prompt loaded into the Gemini API specifies a strict division of labor and rules for data classifications:
- **Confirmed Fact**: Data backed by tracking logs or objective third-party entries (e.g. Accountability Coach updates or logged steps).
- **Client-Reported**: Verbal statements or subjective client updates (e.g., "I slept poorly", "acidity since morning").
- **AI Inference**: High-level deductions connecting separate entries (e.g. attributing acidity to skipped evening meals).
- **Missing / Unavailable**: Categories not mentioned in the transcript.

### Post-Extraction Validation Pipeline (Python)
1. **Structured Parser**: The LLM outputs a JSON string conforming to the Pydantic schema.
2. **Disjointed Quote Splitter**: The backend splits `evidence_quote` by `...` (allowing the LLM to pull quotes from different turns).
3. **Substring Search**: The backend normalizes the quotes (removes punctuation, ignores case, strips extra whitespace) and searches for each quote segment in the raw `transcript.txt`.
4. **Visual Alert**: If a segment is not found, the backend marks the card as `grounded: false`. The frontend renders a red/yellow `⚠️ Grounding Warning` badge on the dashboard.
5. **Interactive Mapping**: If grounded, the backend maps the quotes to their corresponding transcript line IDs. Clicking the quote highlights those lines in the sidebar.

---

## 4. Three Hallucination & Failure Scenarios

When deploying LLMs to analyze clinical, coaching, or health conversations, three failure modes commonly occur. Our prototype has been designed to address them:

| Failure Mode | Scenario Example | How the Prototype Mitigates It |
| :--- | :--- | :--- |
| **1. Fabricated / Paraphrased Quotes** | The client says: *"I slept only around 5 hours last night."* The LLM reports: *"Client stated she slept 5 hours due to exhaustion."* and writes the latter as the verbatim quote. | The backend's **Verbatim Grounding Validator** runs an exact-match search. When it finds that the quote has been altered, it displays a `⚠️ Grounding Warning` on the card. |
| **2. Fact Inflation (Subjective vs. Objective)** | The client says: *"Weight seems slightly up even though I’m eating almost half."* The LLM logs this in the database as an objective weight gain. | The system enforces the **4-Tier Confidence** model. The LLM must classify this metric as `Client-Reported` (subjective) instead of `Confirmed Fact` (objective), preventing data pollution. |
| **3. Extrapolating Missing Data** | The coach asks: *"Did you walk after meals?"* The client does not respond, but later updates: *"Walk and water done."* The LLM infers that they walked after meals. | The system prompts the LLM to label unmentioned/unanswered items as `Missing / Unavailable` and enforces empty strings for quotes, which the coach can review and edit. |

---

## 5. Short Note for the FUME Team

### Key Assumptions
- **Dialogue Order**: The transcript is sequential, representing a continuous 8-day dialogue.
- **Verification Priority**: The coach's judgment is final. The AI acts as an accelerator, but the dashboard forces a review before the intelligence is merged into FUME's primary client records.
- **Evidence Threshold**: Short client responses like "Yes" are not grounded because they lack context. Quotes must be distinct clauses to represent solid evidence.

### What Could Go Wrong in Production
- **Conversational Drift**: Multi-topic turns (e.g., discussing lunch, sleep, and an argument with a coworker in one message) can confuse boundary detectors.
- **Context Window Expansion**: As a client-coach conversation spans months instead of 8 days, passing the entire raw transcript to the LLM increases cost and leads to "lost-in-the-middle" retrieval drops.
- **Client Typos / Slang**: Normalization must handle typos (e.g. "acidity and bloatng" vs. "acidity and bloating") without breaking verbatim grounding matching.

### What to Improve Next
- **Fuzzy Semantic Grounding**: Replace string-matching with a character-level Levenshtein distance check or semantic embeddings. This prevents grounding alerts from triggering on minor spelling variations while still catching fabrications.
- **Daily Trend Analytics**: Incorporate simple parser scripts to extract steps and sleep duration into a structured time-series dataset. This will feed line charts in the dashboard, enabling coaches to spot weekly trends (e.g., the step drop on Day 4).
- **Draft Generator**: Allow the coach to click "Approved" and automatically generate a personalized WhatsApp/SMS check-in message based on the "Recommended next action".

---

## 6. How to Run the Prototype

### Prerequisites
- Python 3.8+ (Python 3.13 supported)

### Steps
1. Navigate to the project directory:
   ```bash
   cd "d:\VibeCoding Project\FUME"
   ```
2. Activate the virtual environment:
   - On Windows (PowerShell):
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - On Windows (CMD):
     ```cmd
     .venv\Scripts\activate.bat
     ```
3. Run the FastAPI application:
   ```bash
   python app.py
   ```
4. Open your browser and navigate to:
   ```
   http://127.0.0.1:8000
   ```
5. **Optional Live Gemini Analysis**:
   - To run live analyses rather than using the mock fallback, add your API key in a `.env` file in the root directory:
     ```env
     GEMINI_API_KEY=your_actual_gemini_api_key_here
     ```
   - Restart the server. Click **Analyze Transcript** on the UI to run the live extraction.

---

## 7. Suggested 3-5 Minute Video Script Outline

When recording your presentation, follow this flow to wow the FUME team:

1. **Introduction (30s)**:
   - Introduce yourself and state the goal: Building a client intelligence analyzer with strict hallucination control and a human-in-the-loop review interface for coaches.
   - Explain your tech choice: A custom Python FastAPI + Vanilla JS codebase because it allows strict programmatic validation of LLM quotes and a fallback mode that works offline.
2. **Dashboard Walkthrough (90s)**:
   - Open `http://127.0.0.1:8000`. Show the split screen: raw transcript on the left, intelligence on the right.
   - Explain the color-coded speakers (Client is blue, coach is pink, accountability coach is green).
   - Point out the **Weekly Summary** and **Metrics Grid**.
3. **Core Features & Grounding Demo (60s)**:
   - Click on the **Evidence Quote** on the *Sleep* card. Show how it highlights the exact matching lines on Day 1, Day 3, and Day 8, and scrolls to them.
   - Show how the confidence tiers work (e.g., *Steps* is a "Confirmed Fact" because of the Accountability Coach log, while *Sleep* is "Client-Reported").
4. **Human-in-the-Loop & Hallucination Mitigation (60s)**:
   - Click the **Edit** button on any card. Show the form: values are editable, and the confidence can be changed.
   - Explain the 3 hallucination scenarios from the README and explain how the Python backend checks if quotes are verbatim.
   - Click **Approve** on a few cards. Point to the progress counter increasing in the navbar.
   - Click **Export Intelligence**. Show the toast message and mention that it saves the final cleaned data directly to `reviewed_analysis.json`.
5. **Conclusion (30s)**:
   - Summarize how your design balances AI-powered automation with human oversight to keep client plans safe, accurate, and structured.

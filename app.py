import os
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FUME Client Intelligence Platform Prototype")

# Define Data Schemas for Structured Output
class IntelligenceItem(BaseModel):
    value: str = Field(description="The extracted value, status, or description for this client metric.")
    confidence: str = Field(description="Confidence classification. Must be exactly one of: 'Confirmed Fact', 'Client-Reported', 'AI Inference', or 'Missing / Unavailable'.")
    evidence_quote: str = Field(description="Verbatim quote(s) from the transcript supporting this finding. Use '...' to separate multiple quotes. Leave blank if missing/unavailable.")

class Categories(BaseModel):
    nutrition_adherence: IntelligenceItem = Field(description="Analysis of what the client ate, protein intake, meal timing, and ACV/salad habits.")
    exercise_steps: IntelligenceItem = Field(description="Analysis of steps, workouts, stretching, daily chores, and activity level.")
    sleep: IntelligenceItem = Field(description="Analysis of sleep duration, quality, timings, and related exhaustion.")
    water_intake: IntelligenceItem = Field(description="Analysis of water consumption (e.g. in litres).")
    symptoms_stress: IntelligenceItem = Field(description="Analysis of symptoms like bloating, acidity, and workplace/personal stress.")
    engagement_level: IntelligenceItem = Field(description="AI inference of how engaged the client is based on reporting frequency, details, and call answer rates.")
    key_barriers: IntelligenceItem = Field(description="Main obstacles preventing the client from adhering to the plan (e.g. busy schedule, stress, planning).")

class RiskFlag(BaseModel):
    description: str = Field(description="A clear description of the risk or attention flag.")
    severity: str = Field(description="Risk severity. Must be one of: 'Low', 'Medium', 'High'.")
    confidence: str = Field(description="Confidence classification. Must be exactly one of: 'Confirmed Fact', 'Client-Reported', 'AI Inference', or 'Missing / Unavailable'.")
    evidence_quote: str = Field(description="Verbatim quote from the transcript supporting this risk.")

class RecommendedAction(BaseModel):
    action_text: str = Field(description="Suggested next action or response for the coach to take.")
    rationale: str = Field(description="Brief explanation of why this action is recommended.")
    confidence: str = Field(default="AI Inference", description="Confidence classification. Always 'AI Inference'.")
    evidence_quote: str = Field(description="Verbatim quote(s) from the transcript that trigger this recommendation.")

class PendingAction(BaseModel):
    action_text: str = Field(description="Action item currently pending.")
    assigned_to: str = Field(description="Who is responsible for this action: 'Coach' or 'Client'.")
    confidence: str = Field(description="Confidence classification. Must be exactly one of: 'Confirmed Fact', 'Client-Reported', 'AI Inference', or 'Missing / Unavailable'.")
    evidence_quote: str = Field(description="Verbatim quote supporting this action.")

class ClientIntelligenceReport(BaseModel):
    weekly_summary: IntelligenceItem = Field(description="A high-level synthesis of the client's progress, major highlights, and concerns.")
    categories: Categories
    risk_flags: List[RiskFlag]
    recommended_next_action: RecommendedAction
    pending_actions: List[PendingAction]


# Helper function: Parse raw transcript into structured lines
def get_parsed_transcript() -> List[dict]:
    transcript_path = "transcript.txt"
    if not os.path.exists(transcript_path):
        return []
    
    parsed_lines = []
    current_day = 0
    line_id = 0
    
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            if line.startswith("Day "):
                try:
                    current_day = int(line.split(" ")[1])
                except:
                    current_day = 0
                parsed_lines.append({
                    "id": line_id,
                    "day": current_day,
                    "speaker": None,
                    "text": line,
                    "is_header": True
                })
                line_id += 1
            else:
                speaker = None
                text = line
                if ":" in line:
                    parts = line.split(":", 1)
                    speaker = parts[0].strip()
                    text = parts[1].strip()
                
                parsed_lines.append({
                    "id": line_id,
                    "day": current_day,
                    "speaker": speaker,
                    "text": text,
                    "is_header": False
                })
                line_id += 1
                
    return parsed_lines


# Helper function: Check if quote is grounded in raw transcript
def verify_quote_grounding(quote: str, raw_transcript: str) -> dict:
    """
    Normalizes and checks if all pieces of a quote exist verbatim in the transcript.
    Splits by '...' to support disjointed quotes.
    Returns: {"grounded": bool, "matched_text": str, "warning": str}
    """
    if not quote or quote.strip() == "":
        return {"grounded": True, "matched_text": "", "warning": ""}
    
    def normalize(text):
        # Remove multiple spaces, newlines, and force lowercase
        return " ".join(text.lower().split()).translate(str.maketrans("", "", '.,;:!?"\'()[]{}'))
    
    norm_transcript = normalize(raw_transcript)
    parts = [p.strip() for p in quote.split("...") if p.strip()]
    
    if not parts:
        return {"grounded": True, "matched_text": "", "warning": ""}
    
    unmatched = []
    matched_segments = []
    
    for part in parts:
        # Ignore extremely short quotes like "Yes" as they lack sufficient distinct content to ground uniquely
        if len(part) < 4:
            continue
        norm_part = normalize(part)
        if norm_part not in norm_transcript:
            unmatched.append(part)
        else:
            matched_segments.append(part)
            
    if unmatched:
        return {
            "grounded": False,
            "matched_text": " ... ".join(matched_segments),
            "warning": f"Ungrounded quote segment(s) detected: {', '.join([f'\"{u}\"' for u in unmatched])}"
        }
        
    return {"grounded": True, "matched_text": quote, "warning": ""}


# Helper function: Map a quote to specific line IDs in the structured transcript
def map_quote_to_lines(quote: str, parsed_transcript: List[dict]) -> List[int]:
    if not quote or quote.strip() == "":
        return []
        
    def normalize(text):
        return " ".join(text.lower().split()).translate(str.maketrans("", "", '.,;:!?"\'()[]{}'))
        
    parts = [p.strip() for p in quote.split("...") if p.strip()]
    matched_ids = []
    
    for line in parsed_transcript:
        if line["is_header"] or not line["text"]:
            continue
        norm_line = normalize(line["text"])
        for part in parts:
            if len(part) < 4:
                continue
            norm_part = normalize(part)
            if norm_part in norm_line:
                matched_ids.append(line["id"])
                break  # avoid adding duplicate lines for the same list item
                
    return list(set(matched_ids))


# Grounding Pipeline: Enrich analysis JSON with grounding checks & line mapping
def enrich_with_grounding(analysis_data: dict, parsed_transcript: List[dict]) -> dict:
    # Read raw transcript as a single string
    raw_transcript_str = "\n".join([line["text"] for line in parsed_transcript])
    
    def process_item(item):
        if not isinstance(item, dict) or "evidence_quote" not in item:
            return item
        
        quote = item.get("evidence_quote", "")
        grounding_result = verify_quote_grounding(quote, raw_transcript_str)
        item["grounded"] = grounding_result["grounded"]
        item["grounding_warning"] = grounding_result["warning"]
        item["matched_line_ids"] = map_quote_to_lines(quote, parsed_transcript)
        item["review_status"] = item.get("review_status", "Pending")
        return item

    # 1. Weekly summary
    if "weekly_summary" in analysis_data:
        analysis_data["weekly_summary"] = process_item(analysis_data["weekly_summary"])
        
    # 2. Categories
    if "categories" in analysis_data:
        for key, category_data in analysis_data["categories"].items():
            analysis_data["categories"][key] = process_item(category_data)
            
    # 3. Risk flags
    if "risk_flags" in analysis_data and isinstance(analysis_data["risk_flags"], list):
        for i in range(len(analysis_data["risk_flags"])):
            analysis_data["risk_flags"][i] = process_item(analysis_data["risk_flags"][i])
            
    # 4. Recommended next action
    if "recommended_next_action" in analysis_data:
        analysis_data["recommended_next_action"] = process_item(analysis_data["recommended_next_action"])
        
    # 5. Pending actions
    if "pending_actions" in analysis_data and isinstance(analysis_data["pending_actions"], list):
        for i in range(len(analysis_data["pending_actions"])):
            analysis_data["pending_actions"][i] = process_item(analysis_data["pending_actions"][i])
            
    return analysis_data


@app.get("/api/transcript")
async def get_transcript():
    try:
        parsed = get_parsed_transcript()
        if not parsed:
            raise HTTPException(status_code=404, detail="Transcript file not found.")
        return parsed
    except Exception as e:
        logger.error(f"Error reading transcript: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def dereference_schema(schema: dict, defs: dict = None) -> dict:
    """
    Recursively inlines all definitions (dereferences $ref) in a JSON schema,
    so that the schema contains no $defs or $ref keys, which Gemini's API rejects.
    """
    if not isinstance(schema, dict):
        return schema
        
    if defs is None:
        defs = schema.get("$defs", schema.get("definitions", {}))
        # Recursively dereference definitions
        defs = {k: dereference_schema(v, defs) for k, v in defs.items()}
        
    if "$ref" in schema:
        ref_path = schema["$ref"]
        ref_key = ref_path.split("/")[-1]
        if ref_key in defs:
            from copy import deepcopy
            ref_schema = deepcopy(defs[ref_key])
            for k, v in schema.items():
                if k != "$ref":
                    ref_schema[k] = v
            return dereference_schema(ref_schema, defs)
            
    cleaned = {}
    for k, v in schema.items():
        if k in ["$defs", "definitions"]:
            continue
        if isinstance(v, dict):
            cleaned[k] = dereference_schema(v, defs)
        elif isinstance(v, list):
            cleaned[k] = [dereference_schema(item, defs) if isinstance(item, dict) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned


def clean_schema(schema: dict) -> dict:
    # First dereference the schema to flatten any nested Pydantic models
    flat_schema = dereference_schema(schema)
    
    # Then recursively remove 'title', 'default', 'additionalProperties', and 'examples'
    def remove_unsupported_keys(node):
        if not isinstance(node, dict):
            return node
        cleaned = {}
        for k, v in node.items():
            if k in ["title", "default", "additionalProperties", "examples"]:
                continue
            if isinstance(v, dict):
                cleaned[k] = remove_unsupported_keys(v)
            elif isinstance(v, list):
                cleaned[k] = [remove_unsupported_keys(item) if isinstance(item, dict) else item for item in v]
            else:
                cleaned[k] = v
        return cleaned
        
    return remove_unsupported_keys(flat_schema)


@app.post("/api/analyze")
async def analyze_transcript(request: Request):
    """
    Endpoint that triggers GenAI analysis. If GEMINI_API_KEY is not defined, 
    falls back to serving the local mock_analysis.json file.
    """
    parsed_transcript = get_parsed_transcript()
    raw_transcript_str = "\n".join([line["text"] for line in parsed_transcript])
    
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        logger.info("GEMINI_API_KEY env variable not found. Falling back to mock_analysis.json.")
        try:
            with open("mock_analysis.json", "r", encoding="utf-8") as f:
                analysis_data = json.load(f)
            # Enrich with grounding checks and mappings dynamically
            enriched_data = enrich_with_grounding(analysis_data, parsed_transcript)
            return JSONResponse(content={
                "status": "success",
                "source": "mock_fallback",
                "data": enriched_data
            })
        except Exception as e:
            logger.error(f"Error loading mock analysis: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to load fallback mock data: {str(e)}")
            
    # Live Gemini API call
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        
        # System prompt setting rules and explaining output expectations
        system_instruction = """
        You are an expert AI Health & Wellness Client Intelligence specialist at FUME.
        Your task is to analyze the provided multi-day coach-client conversation and extract structured intelligence.
        
        For every extracted metric or finding, you must strictly populate:
        1. 'value': a descriptive sentence or metric summary.
        2. 'confidence': Categorize the source of this finding exactly into:
           - 'Confirmed Fact': A metric or status confirmed by tracking logs, accountability coach updates, or objective metrics.
           - 'Client-Reported': Information reported verbally by the client, subjective feelings, or claims that aren't verified by logs.
           - 'AI Inference': Logical conclusion derived by connecting multiple pieces of information (e.g. attributing acidity to skipping meals, or engagement levels).
           - 'Missing / Unavailable': If the transcript does not contain any details or data regarding this category.
        3. 'evidence_quote': Verbatim substring from the conversation supporting the finding. Separate multiple supporting quotes with '...'. If the confidence is 'Missing / Unavailable', leave the quote empty.
        
        CRITICAL RULES:
        - NEVER make up or paraphrase quotes. They must match verbatim.
        - If information is missing or not discussed (e.g. no mention of a specific metric), set the value to 'Not discussed' or 'No data', confidence to 'Missing / Unavailable', and evidence_quote to ''.
        - Identify any critical warnings, severe fatigue, or symptoms under 'risk_flags'.
        - Suggest immediate next actions for the coach and assign any pending tasks.
        """
        
        # We use gemini-2.0-flash as it is highly efficient and supports structured output
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system_instruction
        )
        
        prompt = f"Analyze the following conversation transcript:\n\n{raw_transcript_str}"
        
        # Get and clean schema from Pydantic model to avoid unsupported OpenAPI fields
        raw_schema = ClientIntelligenceReport.model_json_schema()
        cleaned_schema = clean_schema(raw_schema)
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=cleaned_schema
            )
        )
        
        raw_json_output = json.loads(response.text)
        enriched_data = enrich_with_grounding(raw_json_output, parsed_transcript)
        
        return JSONResponse(content={
            "status": "success",
            "source": "gemini_live",
            "data": enriched_data
        })
        
    except Exception as e:
        logger.error(f"Error during Gemini live analysis: {str(e)}")
        # Provide fallback to mock data rather than failing completely
        logger.info("Attempting fallback to mock data due to API error...")
        try:
            with open("mock_analysis.json", "r", encoding="utf-8") as f:
                analysis_data = json.load(f)
            enriched_data = enrich_with_grounding(analysis_data, parsed_transcript)
            return JSONResponse(content={
                "status": "success",
                "source": "api_error_mock_fallback",
                "error_details": str(e),
                "data": enriched_data
            })
        except Exception as fallback_err:
            raise HTTPException(status_code=500, detail=f"Gemini call failed and mock fallback failed: {str(fallback_err)}")


@app.post("/api/save")
async def save_reviewed_report(request: Request):
    """
    Saves the user-reviewed, modified, and approved report to reviewed_analysis.json
    """
    try:
        payload = await request.json()
        with open("reviewed_analysis.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        return {"status": "success", "message": "Report saved successfully to reviewed_analysis.json"}
    except Exception as e:
        logger.error(f"Error saving report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Catch-all endpoint to serve the static SPA
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    frontend_index = os.path.join("frontend", "index.html")
    if os.path.exists(frontend_index):
        with open(frontend_index, "r", encoding="utf-8") as f:
            return f.read()
    return "Frontend index.html not found. Make sure frontend files exist."


# Mount static assets (JS, CSS)
app.mount("/static", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

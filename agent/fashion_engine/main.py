import uvicorn
from fastapi import FastAPI, HTTPException, status
from schemas import FashionQueryPayload, FashionEngineResponse
from graph import run_fashion_engine

app = FastAPI(
    title="Fashion Intelligence Engine",
    version="1.0.0",
    description="LangGraph & Gemini 2.5 Pro powered query engine over fashion mapping JSONs"
)


@app.get("/")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "online", "engine": "Fashion Intelligence Engine v1.0.0"}


@app.post(
    "/analyze", 
    response_model=FashionEngineResponse, 
    status_code=status.HTTP_200_OK,
    summary="Analyze Fashion Trends"
)
async def analyze_fashion_trends(payload: FashionQueryPayload):
    """
    Accepts customer search dictionary, queries MongoDB for fashion looks, 
    and returns a Gemini 2.5 Pro generated trend analysis along with source citations.
    """
    try:
        response = await run_fashion_engine(payload)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while executing the fashion engine: {str(e)}"
        )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
from typing import List, Optional
from pydantic import BaseModel, Field


class FashionQueryPayload(BaseModel):
    """
    Input Request Body Payload from UI/Client.
    """
    # Mandatory Fields
    source: str = Field(
        ..., 
        description="Source platform (e.g., 'vogue')", 
        examples=["vogue"]
    )
    designer: str = Field(
        ..., 
        description="Designer/Brand name (e.g., 'Prada')", 
        examples=["Prada"]
    )
    collection: str = Field(
        ..., 
        description="Collection or Year string (e.g., 'Spring-2026-ready-to-wear' or '2026')", 
        examples=["Spring-2026-ready-to-wear"]
    )
    function: str = Field(
        ..., 
        description="Action/Task required (e.g., 'trend_analysis&recommendation')", 
        examples=["trend_analysis&recommendation"]
    )

    # Focus Areas (tells Gemini what attributes to emphasize in broad/blanket analysis)
    focus_areas: Optional[List[str]] = Field(
        default_factory=list,
        description="Areas for Gemini to prioritize in report (e.g., ['colours', 'themes', 'fabric', 'item_styles'])",
        examples=[["colours", "themes"]]
    )

    # Optional Strict Database Filters
    colors: Optional[List[str]] = Field(
        default=None, 
        description="Optional specific color filters (e.g., ['lime', 'navy blue'])"
    )
    themes: Optional[List[str]] = Field(
        default=None, 
        description="Optional specific theme filters (e.g., ['utilitarian', 'military'])"
    )
    fabrics: Optional[List[str]] = Field(
        default=None, 
        description="Optional specific fabric filters (e.g., ['denim', 'cotton'])"
    )
    item_styles: Optional[List[str]] = Field(
        default=None, 
        description="Optional specific item style filters"
    )


class FashionEngineResponse(BaseModel):
    """
    Output Response Body structure returned to the UI.
    """
    ai_report: str = Field(
        ..., 
        description="The generated trend analysis and recommendation report produced by Gemini 2.5 Pro."
    )
    sources: List[str] = Field(
        ...,
        description="Unique list of sources used in the retrieved records."
    )
    sources_count: int = Field(
        ...,
        description="Number of unique sources."
    )
    designers: List[str] = Field(
        ...,
        description="Unique list of designers found in the retrieved records."
    )
    designers_count: int = Field(
        ...,
        description="Number of unique designers."
    )
    page_urls: List[str] = Field(
        ...,
        description="Unique page URLs associated with the retrieved looks."
    )
    page_urls_count: int = Field(
        ...,
        description="Number of unique page URLs."
    )
    runway_imgs: List[str] = Field(
        ...,
        description="Unique runway image URLs of the looks the analysis is based on (source imagery the customer can inspect)."
    )
    runway_imgs_count: int = Field(
        ...,
        description="Number of unique runway image URLs."
    )
    total_records_analyzed: int = Field(
        ...,
        description="Count of MongoDB records retrieved and processed."
    )
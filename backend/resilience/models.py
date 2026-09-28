"""
Data models for Module 4: Lightweight What-If Resilience & Failure Scope Engine.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class WhatIfRequest(BaseModel):
    target_component: str = "R2-R3"
    target_type: str = "LINK"  # "LINK" or "NODE" or "INTERFACE"
    source: str = "PC1"
    destination: str = "Server"


class WhatIfFlowSummary(BaseModel):
    source: str
    destination: str
    before_path: List[str]
    after_path: Optional[List[str]] = None
    status: str  # "HEALTHY", "REROUTED", "DISRUPTED"


class WhatIfResponse(BaseModel):
    target_component: str
    target_type: str
    source: str
    destination: str
    before_reachable: bool
    before_path: List[str]
    after_reachable: bool
    after_path: Optional[List[str]] = None
    has_alternate_path: bool
    alternate_paths: List[List[str]] = Field(default_factory=list)
    affected_flows_count: int
    unaffected_flows_count: int
    affected_flows: List[WhatIfFlowSummary] = Field(default_factory=list)
    unaffected_flows: List[WhatIfFlowSummary] = Field(default_factory=list)
    failure_scope: str  # "NONE", "LOCALIZED", "PARTITIONED", "WIDESPREAD"
    resilience_assessment: str

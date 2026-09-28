"""
Data models for Module 1: Network Intelligence & Path Analysis.
Defines structured contracts for forwarding paths, alternate paths,
path comparisons, reachability matrices, and component dependency graphs.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class PathInfo(BaseModel):
    path_id: str
    hops: List[str] = Field(default_factory=list)
    hop_count: int = 0
    links: List[str] = Field(default_factory=list)
    status: str = "active"  # "active", "degraded", "blocked"
    is_primary: bool = False
    cost: float = 0.0


class PathQueryResponse(BaseModel):
    source: str
    destination: str
    reachable: bool
    primary_path: Optional[PathInfo] = None
    hop_count: int = 0
    nodes_traversed: List[str] = Field(default_factory=list)
    links_traversed: List[str] = Field(default_factory=list)
    path_cost: float = 0.0
    alternate_paths_available: int = 0
    selection_rule: str = "Deterministic Minimal Hop Count (Shortest Path)"
    bottlenecks: List[str] = Field(default_factory=list)


class AlternatePathsResponse(BaseModel):
    source: str
    destination: str
    reachable: bool
    primary_path: Optional[PathInfo] = None
    alternate_paths: List[PathInfo] = Field(default_factory=list)
    total_physical_paths: int = 0
    active_alternate_paths: int = 0
    redundancy_status: str = "NONE"  # "HIGH", "PARTIAL", "NONE"


class PathComparisonRequest(BaseModel):
    path_a: List[str]
    path_b: List[str]


class PathComparisonResponse(BaseModel):
    path_a: List[str]
    path_b: List[str]
    hop_count_a: int
    hop_count_b: int
    hop_difference: int
    common_nodes: List[str]
    common_links: List[str]
    unique_nodes_a: List[str]
    unique_nodes_b: List[str]
    unique_links_a: List[str]
    unique_links_b: List[str]
    shared_dependency_points: List[str]
    similarity_percentage: float


class ReachabilityCell(BaseModel):
    source: str
    destination: str
    status: str  # "REACHABLE", "UNREACHABLE", "SAME_NODE"
    hop_count: Optional[int] = None
    path: Optional[List[str]] = None


class ReachabilityMatrixResponse(BaseModel):
    endpoints: List[str]
    matrix: Dict[str, Dict[str, ReachabilityCell]]
    total_pairs: int
    reachable_pairs: int
    unreachable_pairs: int
    network_health_percentage: float


class DependentFlow(BaseModel):
    source: str
    destination: str
    path: List[str]
    hops: int


class ComponentDependencyResponse(BaseModel):
    component_type: str  # "link" or "node"
    component_id: str
    status: str  # "up" or "down"
    dependent_flows: List[DependentFlow] = Field(default_factory=list)
    dependent_flow_count: int = 0
    has_alternate_bypass: bool = False
    criticality: str = "LOW"  # "HIGH", "MEDIUM", "LOW"
    summary: str = ""

from typing import List, Optional
from pydantic import BaseModel
from topology.network import TopologyData
from failure.signature import FailureSignature
from causal.dependency import DependencyGraph


class ReproductionComparison(BaseModel):
    signature_match: bool
    dependency_match: bool
    baseline_path_match: bool
    preserved_fields: List[str]
    changed_fields: List[str]
    missing_relationships: List[str]


class ReproductionRun(BaseModel):
    run_number: int
    status: str  # "SUCCESS" or "FAILED"
    signature_match: bool
    dependency_match: bool
    baseline_path_match: bool
    message: str


class ReproductionRequest(BaseModel):
    runs: int = 3


class ReproductionResponse(BaseModel):
    target_failure: FailureSignature
    target_dependencies: DependencyGraph
    reduced_topology: TopologyData
    total_runs: int
    successful_runs: int
    reproduction_validated: bool
    runs: List[ReproductionRun]
    final_signature: Optional[FailureSignature] = None
    final_dependencies: Optional[DependencyGraph] = None
    message: str

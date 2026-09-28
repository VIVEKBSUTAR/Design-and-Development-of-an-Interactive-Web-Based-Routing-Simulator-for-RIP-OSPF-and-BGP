from typing import List, Optional
from pydantic import BaseModel
from topology.network import TopologyData
from failure.signature import FailureSignature
from causal.dependency import DependencyGraph


class SignatureComparison(BaseModel):
    match: bool
    preserved_fields: List[str]
    changed_fields: List[str]


class DependencyComparison(BaseModel):
    match: bool
    preserved_relationships: List[str]
    missing_relationships: List[str]


class CandidateEvaluationResult(BaseModel):
    candidate: str
    candidate_type: str = "NODE"
    action: str = "REMOVE"
    status: str  # "ACCEPTED" or "REJECTED"
    signature_match: bool
    dependency_match: bool
    signature_comparison: SignatureComparison
    dependency_comparison: DependencyComparison
    preserved_fields: List[str]
    changed_fields: List[str]
    preserved_relationships: List[str]
    missing_relationships: List[str]
    message: str


class ReductionExperimentRequest(BaseModel):
    candidates: Optional[List[str]] = None


class ReductionExperimentResponse(BaseModel):
    original_topology: TopologyData
    target_failure: FailureSignature
    target_dependencies: DependencyGraph
    candidate_evaluations: List[CandidateEvaluationResult]
    accepted_candidates: List[str]
    rejected_candidates: List[str]
    final_topology: TopologyData
    final_failure_signature: Optional[FailureSignature] = None
    final_causal_dependencies: Optional[DependencyGraph] = None
    message: str

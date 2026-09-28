from typing import List, Optional
from pydantic import BaseModel
from topology.network import TopologyData
from failure.signature import FailureSignature
from causal.dependency import DependencyGraph
from reduction.models import ReductionExperimentResponse
from reproduction.models import ReproductionResponse


class ExperimentSummaryMetrics(BaseModel):
    original_nodes: int
    original_links: int
    reduced_nodes: int
    reduced_links: int
    nodes_removed: int
    links_removed: int
    accepted_candidates: List[str]
    rejected_candidates: List[str]
    reproduction_runs: int
    successful_runs: int
    reproduction_validated: bool


class CompleteExperimentResponse(BaseModel):
    experiment_status: str  # e.g., "SUCCESS" or "FAILED"
    baseline_topology: TopologyData
    target_failure: FailureSignature
    target_signature: FailureSignature
    target_dependencies: DependencyGraph
    reduction_result: ReductionExperimentResponse
    reproduction_result: ReproductionResponse
    summary_metrics: ExperimentSummaryMetrics
    message: str

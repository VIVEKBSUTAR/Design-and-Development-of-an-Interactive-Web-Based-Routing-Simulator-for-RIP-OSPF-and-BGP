"""
Data models for Module 3: Fault Injection, Failure Localization & Diagnosis.
Provides structured contracts for fault scenarios, probe-based failure observations,
fault localization, candidate hypotheses, evidence deduction, and network impact analysis.
"""

import time
from enum import Enum
from typing import List, Dict, Optional, Any, Tuple
from pydantic import BaseModel, Field


class FaultType(str, Enum):
    LINK_FAILURE = "LINK_FAILURE"
    NODE_FAILURE = "NODE_FAILURE"
    INTERFACE_FAILURE = "INTERFACE_FAILURE"
    PACKET_LOSS = "PACKET_LOSS"
    PACKET_DELAY = "PACKET_DELAY"


class FaultScenario(BaseModel):
    fault_id: str
    fault_type: FaultType
    target_node: Optional[str] = None
    target_link: Optional[str] = None
    target_interface_node: Optional[str] = None
    target_interface_remote: Optional[str] = None
    description: str = ""
    is_active: bool = True
    created_at: float = Field(default_factory=time.time)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FaultInjectionRequest(BaseModel):
    fault_type: FaultType
    target_node: Optional[str] = None
    target_link: Optional[str] = None
    target_interface_node: Optional[str] = None
    target_interface_remote: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class FaultRestoreRequest(BaseModel):
    fault_id: Optional[str] = None  # None indicates restore all active faults


class FailureObservation(BaseModel):
    source: str
    destination: str
    reachability_status: str  # "HEALTHY", "DEGRADED", "FAILED"
    probes_sent: int
    probes_delivered: int
    probes_dropped: int
    packet_loss_percentage: float
    avg_rtt_ms: Optional[float] = None
    nominal_path: List[str] = Field(default_factory=list)
    observed_path: List[str] = Field(default_factory=list)
    last_reachable_node: Optional[str] = None
    failed_transition: Optional[str] = None  # e.g. "R2 -> R3"
    failed_link: Optional[str] = None        # e.g. "R2-R3"
    drop_reason: Optional[str] = None
    node_states_observed: Dict[str, str] = Field(default_factory=dict)
    link_states_observed: Dict[str, str] = Field(default_factory=dict)
    healthy_branches: List[str] = Field(default_factory=list)
    timestamp_ms: float = Field(default_factory=time.time)
    evidence_log: List[str] = Field(default_factory=list)


class LocalizationResult(BaseModel):
    last_reachable_node: str
    first_failed_transition: Optional[str] = None  # e.g. "R2 -> R3"
    suspected_link: Optional[str] = None           # e.g. "R2-R3"
    suspected_interface: Optional[str] = None      # e.g. "R3 (facing R2)"
    suspected_node: Optional[str] = None           # e.g. "R3"
    candidate_components: List[str] = Field(default_factory=list)
    localization_notes: str = ""


class HypothesisCategory(str, Enum):
    LINK = "LINK"
    NODE = "NODE"
    INTERFACE = "INTERFACE"
    ROUTING = "ROUTING"


class HypothesisStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    PROBABLE = "PROBABLE"
    UNLIKELY = "UNLIKELY"
    REFUTED = "REFUTED"


class Hypothesis(BaseModel):
    hypothesis_id: str  # e.g. "H1"
    title: str
    category: HypothesisCategory
    target: str
    confidence_score: float  # 0.0 to 1.0
    confidence_level: str    # "HIGH", "MEDIUM", "LOW"
    status: HypothesisStatus
    supporting_evidence: List[str] = Field(default_factory=list)
    contradicting_evidence: List[str] = Field(default_factory=list)
    targeted_test_conducted: str = ""
    targeted_test_result: str = ""


class DiagnosisStatus(str, Enum):
    FAILURE_CONFIRMED = "FAILURE_CONFIRMED"
    FAILURE_PROBABLE = "FAILURE_PROBABLE"
    AMBIGUOUS = "AMBIGUOUS"
    NO_FAILURE_DETECTED = "NO_FAILURE_DETECTED"


class DiagnosisResult(BaseModel):
    status: DiagnosisStatus
    primary_cause: Optional[Hypothesis] = None
    confidence: str = "HIGH"  # "HIGH", "MEDIUM", "LOW"
    localization: Optional[LocalizationResult] = None
    candidate_hypotheses: List[Hypothesis] = Field(default_factory=list)
    supporting_evidence: List[str] = Field(default_factory=list)
    contradicting_evidence: List[str] = Field(default_factory=list)
    recommended_action: str = ""
    summary: str = ""


class FailureScope(str, Enum):
    NONE = "NONE"
    LOCALIZED = "LOCALIZED"
    PARTITIONED = "PARTITIONED"
    WIDESPREAD = "WIDESPREAD"


class ImpactedFlow(BaseModel):
    source: str
    destination: str
    status: str  # "FAILED", "DEGRADED", "HEALTHY"
    path: List[str] = Field(default_factory=list)
    hops: int = 0
    traverses_failed_component: bool = False


class ImpactAnalysisResult(BaseModel):
    failure_scope: FailureScope
    failed_components: List[str] = Field(default_factory=list)
    total_flows_evaluated: int = 0
    affected_flows_count: int = 0
    unaffected_flows_count: int = 0
    affected_flows: List[ImpactedFlow] = Field(default_factory=list)
    unaffected_flows: List[ImpactedFlow] = Field(default_factory=list)
    isolated_endpoints: List[str] = Field(default_factory=list)
    summary: str = ""

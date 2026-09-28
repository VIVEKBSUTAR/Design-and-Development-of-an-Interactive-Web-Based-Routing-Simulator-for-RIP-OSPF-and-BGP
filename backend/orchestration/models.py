"""
Data models for Module 2: Intelligent Network Testing and Test Orchestration.
Supports structured network tests, deterministic decision engine, test campaigns,
and failure investigation handoffs.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from simulation.models import ProbeSimulationResult, ProbeEvent


class TestStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    BLOCKED = "BLOCKED"


class TestCategory(str, Enum):
    CONNECTIVITY = "CONNECTIVITY"
    PATH = "PATH"
    REACHABILITY = "REACHABILITY"
    ALTERNATE_PATH = "ALTERNATE_PATH"
    BRANCH_ISOLATION = "BRANCH_ISOLATION"
    RECOVERY = "RECOVERY"
    LINK_INVESTIGATION = "LINK_INVESTIGATION"
    NODE_INVESTIGATION = "NODE_INVESTIGATION"
    INTERFACE_INVESTIGATION = "INTERFACE_INVESTIGATION"


class CampaignStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class NetworkTestDefinition(BaseModel):
    test_id: str
    name: str
    category: TestCategory
    purpose: str
    preconditions: List[str] = Field(default_factory=list)
    description: str
    is_automated_eligible: bool = True


class TestObservation(BaseModel):
    metric: str
    value: Any
    interpretation: str


class TestResult(BaseModel):
    test_id: str
    name: str
    category: TestCategory
    status: TestStatus
    source: str
    destination: str
    sequence_number: int
    timestamp_ms: float
    duration_ms: float
    expected_result: str
    actual_result: str
    observations: List[str] = Field(default_factory=list)
    structured_observations: List[TestObservation] = Field(default_factory=list)
    simulation_result: Optional[ProbeSimulationResult] = None
    failure_detected: bool = False
    drop_node: Optional[str] = None
    drop_link: Optional[str] = None
    drop_reason: Optional[str] = None
    nominal_path: List[str] = Field(default_factory=list)
    observed_path: List[str] = Field(default_factory=list)
    follow_up_recommendations: List[str] = Field(default_factory=list)


class NextTestDecision(BaseModel):
    test_id: str
    name: str
    category: TestCategory
    target_source: str
    target_destination: str
    reason: str
    evidence: List[str] = Field(default_factory=list)
    confidence: str = "HIGH"
    parameters: Dict[str, Any] = Field(default_factory=dict)


class FailureHandoff(BaseModel):
    failure_detected: bool
    symptom: str
    source: str
    destination: str
    observed_path: List[str] = Field(default_factory=list)
    drop_node: Optional[str] = None
    drop_link: Optional[str] = None
    drop_reason: Optional[str] = None
    packet_loss_percentage: float
    affected_components: List[str] = Field(default_factory=list)
    isolated_healthy_branches: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    recommended_diagnosis_target: Optional[str] = None
    ready_for_diagnosis: bool = True


class TestCampaign(BaseModel):
    id: str
    name: str
    network_name: str
    source: str
    destination: str
    mode: str = "automated"  # "automated" or "manual"
    status: CampaignStatus = CampaignStatus.NOT_STARTED
    current_step_index: int = 0
    executed_tests: List[TestResult] = Field(default_factory=list)
    next_test_recommendation: Optional[NextTestDecision] = None
    failure_handoff: Optional[FailureHandoff] = None
    summary: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0


class StartCampaignRequest(BaseModel):
    name: Optional[str] = "Campus Network Resilience"
    source: Optional[str] = "PC1"
    destination: Optional[str] = "Server"
    mode: Optional[str] = "automated"


class ExecuteStepRequest(BaseModel):
    test_id: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None

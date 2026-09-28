"""
Pydantic data models for discrete-event probe and packet simulation.
Strictly separates empirical network observations from fault diagnosis.
"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ProbeEventType(str, Enum):
    PROBE_CREATED = "PROBE_CREATED"
    PACKET_CREATED = "PACKET_CREATED"
    SENT = "SENT"
    FORWARDED = "FORWARDED"
    RECEIVED = "RECEIVED"
    DROPPED = "DROPPED"
    TIMEOUT = "TIMEOUT"


class ProbeEvent(BaseModel):
    sequence: int
    timestamp_ms: float
    event_type: ProbeEventType
    current_node: str
    next_node: Optional[str] = None
    link_id: Optional[str] = None
    packet_id: str
    details: str
    hop_number: int = 0


class ProbeRequest(BaseModel):
    source: str = "PC1"
    destination: str = "Server"
    probe_count: int = 3
    probe_type: str = "ICMP_ECHO"
    timeout_ms: float = 1000.0


class SingleProbeTrace(BaseModel):
    probe_index: int
    packet_id: str
    status: str  # "DELIVERED", "DROPPED", "UNREACHABLE"
    rtt_ms: Optional[float] = None
    hops_traversed: List[str] = Field(default_factory=list)
    drop_node: Optional[str] = None
    drop_link: Optional[str] = None
    drop_reason: Optional[str] = None
    events: List[ProbeEvent] = Field(default_factory=list)


class ProbeSimulationResult(BaseModel):
    source: str
    destination: str
    probes_sent: int
    probes_received: int
    probes_dropped: int
    packet_loss_percentage: float
    avg_rtt_ms: Optional[float] = None
    network_reachability_status: str  # "HEALTHY", "DEGRADED", "FAILED"
    nominal_path: List[str] = Field(default_factory=list)
    observed_path: List[str] = Field(default_factory=list)
    all_events: List[ProbeEvent] = Field(default_factory=list)
    probe_details: List[SingleProbeTrace] = Field(default_factory=list)
    empirical_observation: str


class DiagnosisResult(BaseModel):
    detected_failure: bool
    symptom: str
    observation_summary: str
    suspected_component_type: Optional[str] = None  # "link", "node", "none"
    suspected_component_id: Optional[str] = None
    confidence: str  # "HIGH", "MEDIUM", "LOW", "N/A"
    isolation_assessment: str
    recommended_action: str

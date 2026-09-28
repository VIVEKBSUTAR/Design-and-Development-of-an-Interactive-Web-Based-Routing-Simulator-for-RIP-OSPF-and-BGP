from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from topology import NetworkTopology, TopologyData, NodeType
from failure import FailureSignatureResponse, FailureSignatureGenerator
from causal import CausalDependencyResponse, CausalDependencyGenerator
from reduction import (
    ReductionExperimentRequest,
    ReductionExperimentResponse,
    FailureReducer,
)
from reproduction import (
    ReproductionRequest,
    ReproductionResponse,
    FailureReproducer,
)
from experiment import (
    CompleteExperimentResponse,
    ExperimentPipeline,
    InvestigationStage,
    FullInvestigationRecord,
    IntegratedInvestigationEngine,
)
from resilience import (
    WhatIfResilienceEngine,
    WhatIfRequest,
    WhatIfResponse,
)
from simulation import (
    ProbeSimulator,
    ProbeRequest,
    ProbeSimulationResult,
    DiagnosisResult,
    diagnose_from_observations,
)
from orchestration import (
    NetworkTestLibrary,
    NextTestSelector,
    CampaignOrchestrator,
    TestCampaign,
    NetworkTestDefinition,
    StartCampaignRequest,
    ExecuteStepRequest,
    FailureHandoff,
)
from intelligence import (
    NetworkIntelligenceEngine,
    PathQueryResponse,
    AlternatePathsResponse,
    PathComparisonRequest,
    PathComparisonResponse,
    ReachabilityMatrixResponse,
    ComponentDependencyResponse,
)
from diagnosis import (
    FaultInjectionEngine,
    FailureObservationEngine,
    FailureLocalizationEngine,
    HypothesisEngine,
    ImpactAnalysisEngine,
    DiagnosisEngine,
    FaultScenario,
    FaultInjectionRequest,
    FaultRestoreRequest,
    FailureObservation,
    LocalizationResult,
    DiagnosisResult as Module3DiagnosisResult,
    ImpactAnalysisResult,
)

app = FastAPI(
    title="Network Failure Testing and Reproduction System API",
    version="0.1.0",
)

# CORS configuration to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Independent Network Topology Engine, Failure Signature Generator, Causal Generator, Reducer, Reproducer, and Pipeline
topology_engine = NetworkTopology()
intelligence_engine = NetworkIntelligenceEngine(topology_engine)
failure_generator = FailureSignatureGenerator(topology_engine)
causal_generator = CausalDependencyGenerator(failure_generator)
failure_reducer = FailureReducer(topology_engine, failure_generator, causal_generator)
failure_reproducer = FailureReproducer(
    topology_engine, failure_generator, causal_generator, failure_reducer
)
experiment_pipeline = ExperimentPipeline(
    topology_engine,
    failure_generator,
    causal_generator,
    failure_reducer,
    failure_reproducer,
)
probe_simulator = ProbeSimulator(topology_engine)
test_library = NetworkTestLibrary(topology_engine, probe_simulator, intelligence_engine)
test_selector = NextTestSelector(topology_engine)
campaign_orchestrator = CampaignOrchestrator(
    topology_engine, probe_simulator, test_library, test_selector
)

# Module 3: Fault Injection, Failure Observation, Localization & Diagnosis Engines
fault_engine = FaultInjectionEngine(topology_engine)
observation_engine = FailureObservationEngine(topology_engine, probe_simulator)
localization_engine = FailureLocalizationEngine(topology_engine)
hypothesis_engine = HypothesisEngine()
impact_engine = ImpactAnalysisEngine(topology_engine, intelligence_engine)
diagnosis_engine = DiagnosisEngine(
    topology_engine,
    observation_engine,
    localization_engine,
    hypothesis_engine,
    impact_engine,
)

# Module 4: What-If Resilience & Integrated Investigation Engines
what_if_engine = WhatIfResilienceEngine(topology_engine, intelligence_engine)
investigation_engine = IntegratedInvestigationEngine(
    topology=topology_engine,
    intelligence_engine=intelligence_engine,
    fault_engine=fault_engine,
    observation_engine=observation_engine,
    localization_engine=localization_engine,
    hypothesis_engine=hypothesis_engine,
    diagnosis_engine=diagnosis_engine,
    impact_engine=impact_engine,
    failure_generator=failure_generator,
    causal_generator=causal_generator,
    reducer=failure_reducer,
    reproducer=failure_reproducer,
    what_if_engine=what_if_engine,
)


class ReachabilityResponse(BaseModel):
    source: str
    destination: str
    reachable: bool
    path: Optional[List[str]] = None


class ResetResponse(BaseModel):
    status: str
    message: str


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/topology", response_model=TopologyData)
def get_topology():
    return topology_engine.get_topology_data()


@app.post("/api/reset", response_model=ResetResponse)
@app.post("/api/topology/reset", response_model=ResetResponse)
def reset_topology():
    topology_engine.reset()
    return ResetResponse(status="ok", message="Topology reset to default")


@app.get("/api/topology/reachability", response_model=ReachabilityResponse)
def check_reachability(
    source: str = Query(..., description="Source node ID"),
    destination: str = Query(..., description="Destination node ID"),
):
    if source not in topology_engine.graph:
        raise HTTPException(status_code=404, detail=f"Source node '{source}' not found in topology")
    if destination not in topology_engine.graph:
        raise HTTPException(status_code=404, detail=f"Destination node '{destination}' not found in topology")

    reachable = topology_engine.has_path(source, destination)
    path = topology_engine.get_path(source, destination) if reachable else None

    return ReachabilityResponse(
        source=source,
        destination=destination,
        reachable=reachable,
        path=path,
    )


class LinkActionRequest(BaseModel):
    source: str
    destination: str


class LinkActionResponse(BaseModel):
    status: str
    message: str
    source: str
    destination: str
    link_status: str


@app.post("/api/topology/fail-link", response_model=LinkActionResponse)
def fail_link(request: LinkActionRequest):
    if not topology_engine.graph.has_edge(request.source, request.destination):
        raise HTTPException(
            status_code=404,
            detail=f"Link between '{request.source}' and '{request.destination}' not found in topology",
        )

    topology_engine.fail_link(request.source, request.destination)
    return LinkActionResponse(
        status="ok",
        message=f"Link {request.source} <-> {request.destination} marked as down",
        source=request.source,
        destination=request.destination,
        link_status="down",
    )


@app.post("/api/topology/restore-link", response_model=LinkActionResponse)
def restore_link(request: LinkActionRequest):
    if not topology_engine.graph.has_edge(request.source, request.destination):
        raise HTTPException(
            status_code=404,
            detail=f"Link between '{request.source}' and '{request.destination}' not found in topology",
        )

    topology_engine.restore_link(request.source, request.destination)
    return LinkActionResponse(
        status="ok",
        message=f"Link {request.source} <-> {request.destination} marked as up",
        source=request.source,
        destination=request.destination,
        link_status="up",
    )


@app.get("/api/failure-signature", response_model=FailureSignatureResponse)
def get_failure_signature(
    source: str = Query("PC1", description="Source node ID"),
    destination: str = Query("Server", description="Destination node ID"),
):
    # Determine pre-failure baseline path if nodes are connected in the underlying graph
    import networkx as nx
    baseline = (
        nx.shortest_path(topology_engine.graph, source, destination)
        if (
            topology_engine.graph.has_node(source)
            and topology_engine.graph.has_node(destination)
            and nx.has_path(topology_engine.graph, source, destination)
        )
        else None
    )

    sig = failure_generator.generate_signature(
        source=source, destination=destination, baseline_path=baseline
    )
    if sig is None:
        return FailureSignatureResponse(
            active=False,
            message="No active network failure detected",
        )

    return FailureSignatureResponse(
        active=True,
        message=f"Active failure detected on {sig.failed_component}",
        signature=sig,
        source=sig.source,
        destination=sig.destination,
        baseline_path=sig.baseline_path,
        reachable=sig.reachable,
        path=sig.path,
        packet_loss=sig.packet_loss,
        fault_type=sig.fault_type,
        failed_component=sig.failed_component,
        routing_change=sig.routing_change,
        link_state=sig.link_state,
    )


@app.get("/api/causal-dependencies", response_model=CausalDependencyResponse)
def get_causal_dependencies(
    source: str = Query("PC1", description="Source node ID"),
    destination: str = Query("Server", description="Destination node ID"),
):
    import networkx as nx
    baseline = (
        nx.shortest_path(topology_engine.graph, source, destination)
        if (
            topology_engine.graph.has_node(source)
            and topology_engine.graph.has_node(destination)
            and nx.has_path(topology_engine.graph, source, destination)
        )
        else None
    )

    graph = causal_generator.generate_dependencies(
        source=source, destination=destination, baseline_path=baseline
    )
    if graph is None:
        return CausalDependencyResponse(
            active=False,
            message="No active failure to trace causal dependencies",
            graph=None,
        )

    return CausalDependencyResponse(
        active=True,
        message="Causal dependency chain generated for active failure",
        graph=graph,
    )


@app.post("/api/reduction/run", response_model=ReductionExperimentResponse)
def run_reduction(request: Optional[ReductionExperimentRequest] = None):
    candidates = request.candidates if request and request.candidates else ["PC2", "R4", "R1"]
    return failure_reducer.run_reduction_experiment(candidates=candidates)


@app.post("/api/reproduction/run", response_model=ReproductionResponse)
def run_reproduction(request: Optional[ReproductionRequest] = None):
    runs = request.runs if request and request.runs is not None else 3
    return failure_reproducer.run_reproduction_experiment(runs=runs)


@app.post("/api/experiment/run", response_model=CompleteExperimentResponse)
def run_complete_experiment():
    return experiment_pipeline.run_complete_experiment()


class HealthTestResponse(BaseModel):
    simulation: ProbeSimulationResult
    diagnosis: DiagnosisResult


@app.post("/api/simulation/health-test", response_model=HealthTestResponse)
def run_health_test(request: Optional[ProbeRequest] = None):
    req = request or ProbeRequest()
    sim_result = probe_simulator.run_health_test(req)
    diag_result = diagnose_from_observations(sim_result, topology_engine)
    return HealthTestResponse(simulation=sim_result, diagnosis=diag_result)


class CreateNodeRequest(BaseModel):
    id: str
    label: Optional[str] = None
    node_type: str = "router"
    health_status: str = "up"
    x: Optional[float] = 100.0
    y: Optional[float] = 100.0


@app.post("/api/topology/nodes")
def create_node(request: CreateNodeRequest):
    if topology_engine.has_node(request.id):
        raise HTTPException(status_code=400, detail=f"Node '{request.id}' already exists")

    try:
        ntype = NodeType(request.node_type.lower())
    except ValueError:
        ntype = NodeType.ROUTER

    topology_engine.add_node(
        node_id=request.id,
        name=request.label or request.id,
        node_type=ntype,
        health_status=request.health_status,
        x=request.x,
        y=request.y,
    )
    return {"status": "ok", "message": f"Node '{request.id}' created"}


class UpdateNodeRequest(BaseModel):
    label: Optional[str] = None
    node_type: Optional[str] = None
    health_status: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None


@app.patch("/api/topology/nodes/{node_id}")
@app.post("/api/topology/nodes/{node_id}")
def update_node(node_id: str, request: UpdateNodeRequest):
    if not topology_engine.has_node(node_id):
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")

    ntype = None
    if request.node_type:
        try:
            ntype = NodeType(request.node_type.lower())
        except ValueError:
            pass

    topology_engine.update_node(
        node_id=node_id,
        name=request.label,
        node_type=ntype,
        health_status=request.health_status,
        x=request.x,
        y=request.y,
    )
    return {"status": "ok", "message": f"Node '{node_id}' updated"}


@app.delete("/api/topology/nodes/{node_id}")
def delete_node(node_id: str):
    if not topology_engine.has_node(node_id):
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    topology_engine.remove_node(node_id)
    return {"status": "ok", "message": f"Node '{node_id}' deleted"}


class LinkEditRequest(BaseModel):
    source: str
    destination: str
    status: Optional[str] = "up"


@app.post("/api/topology/links")
def create_link(request: LinkEditRequest):
    if not topology_engine.has_node(request.source):
        raise HTTPException(status_code=404, detail=f"Source node '{request.source}' not found")
    if not topology_engine.has_node(request.destination):
        raise HTTPException(status_code=404, detail=f"Destination node '{request.destination}' not found")
    if request.source == request.destination:
        raise HTTPException(status_code=400, detail="Cannot link a node to itself")

    topology_engine.add_link(request.source, request.destination, status=request.status or "up")
    return {"status": "ok", "message": f"Link between '{request.source}' and '{request.destination}' created"}


@app.delete("/api/topology/links")
def delete_link(request: LinkEditRequest):
    removed = topology_engine.remove_link(request.source, request.destination)
    if not removed:
        raise HTTPException(
            status_code=404,
            detail=f"Link between '{request.source}' and '{request.destination}' not found",
        )
    return {"status": "ok", "message": f"Link between '{request.source}' and '{request.destination}' removed"}


# =============================================================================
# MODULE 2: Intelligent Network Testing & Test Orchestration API
# =============================================================================

@app.get("/api/orchestration/library", response_model=List[NetworkTestDefinition])
def get_test_library():
    """Returns available tests in the test library with purpose and preconditions."""
    return test_library.list_tests()


@app.get("/api/orchestration/campaigns", response_model=List[TestCampaign])
def list_campaigns():
    """Lists all active and historical test campaigns."""
    return campaign_orchestrator.list_campaigns()


@app.post("/api/orchestration/campaigns", response_model=TestCampaign)
def create_campaign(request: Optional[StartCampaignRequest] = None):
    """Creates a new test campaign on the current network topology."""
    req = request or StartCampaignRequest()
    return campaign_orchestrator.create_campaign(
        name=req.name or "Campus Network Resilience",
        source=req.source or "PC1",
        destination=req.destination or "Server",
        mode=req.mode or "automated",
    )


@app.get("/api/orchestration/campaigns/{campaign_id}", response_model=TestCampaign)
def get_campaign(campaign_id: str):
    """Returns state, executed tests, and next test recommendation for a campaign."""
    campaign = campaign_orchestrator.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    return campaign


@app.post("/api/orchestration/campaigns/{campaign_id}/start", response_model=TestCampaign)
def start_campaign(campaign_id: str):
    """Starts a campaign execution."""
    try:
        return campaign_orchestrator.start_campaign(campaign_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")


@app.post("/api/orchestration/campaigns/{campaign_id}/step", response_model=TestCampaign)
def execute_campaign_step(campaign_id: str, request: Optional[ExecuteStepRequest] = None):
    """
    Executes the next step in the campaign.
    In automated mode, executes the system-recommended test.
    In manual mode, executes the specified override test_id.
    """
    try:
        override_id = request.test_id if request else None
        params = request.parameters if request else None
        return campaign_orchestrator.execute_next_step(
            campaign_id=campaign_id,
            override_test_id=override_id,
            parameters=params,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/orchestration/campaigns/{campaign_id}/reset", response_model=TestCampaign)
def reset_campaign(campaign_id: str):
    """Resets the campaign step progression and executed tests."""
    try:
        return campaign_orchestrator.reset_campaign(campaign_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")


@app.get("/api/orchestration/campaigns/{campaign_id}/handoff", response_model=Optional[FailureHandoff])
def get_failure_handoff(campaign_id: str):
    """Returns structured failure handoff data for Module 3/4 failure diagnosis."""
    campaign = campaign_orchestrator.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    return campaign.failure_handoff


# =============================================================================
# MODULE 1: Network Intelligence & Path Analysis API
# =============================================================================

@app.get("/api/network-intelligence/path", response_model=PathQueryResponse)
def get_network_path(
    source: str = Query(..., description="Source node identifier"),
    destination: str = Query(..., description="Destination node identifier"),
):
    """
    Computes active forwarding path, hop count, traversed links,
    and bottleneck cut-edges using deterministic path selection.
    """
    if not topology_engine.has_node(source):
        raise HTTPException(status_code=404, detail=f"Source node '{source}' not found")
    if not topology_engine.has_node(destination):
        raise HTTPException(status_code=404, detail=f"Destination node '{destination}' not found")

    return intelligence_engine.analyze_path(source, destination)


@app.get("/api/network-intelligence/alternate-paths", response_model=AlternatePathsResponse)
def get_alternate_paths(
    source: str = Query(..., description="Source node identifier"),
    destination: str = Query(..., description="Destination node identifier"),
):
    """
    Discovers all physical loop-free candidate paths between endpoints,
    evaluating topological redundancy and failover availability.
    """
    if not topology_engine.has_node(source):
        raise HTTPException(status_code=404, detail=f"Source node '{source}' not found")
    if not topology_engine.has_node(destination):
        raise HTTPException(status_code=404, detail=f"Destination node '{destination}' not found")

    return intelligence_engine.get_alternate_paths(source, destination)


@app.post("/api/network-intelligence/compare-paths", response_model=PathComparisonResponse)
def compare_paths(request: PathComparisonRequest):
    """
    Compares two paths structurally, identifying shared dependencies,
    common nodes/links, unique segments, and similarity metrics.
    """
    return intelligence_engine.compare_paths(request.path_a, request.path_b)


@app.get("/api/network-intelligence/reachability", response_model=ReachabilityMatrixResponse)
def get_reachability_matrix():
    """
    Computes full pairwise reachability matrix across all host/server endpoints,
    dynamically reflecting current link and node operational statuses.
    """
    return intelligence_engine.get_reachability_matrix()


@app.get("/api/network-intelligence/dependencies", response_model=ComponentDependencyResponse)
def get_component_dependencies(
    component_type: str = Query("link", description="'link' or 'node'"),
    component_id: str = Query(..., description="Component identifier (e.g. 'R2-R3' or 'R2')"),
):
    """
    Analyzes which active end-to-end traffic flows depend on a specific link or router,
    evaluating alternate bypass availability and criticality.
    """
    return intelligence_engine.analyze_component_dependencies(component_type, component_id)


# =============================================================================
# MODULE 3 — FAULT INJECTION, FAILURE LOCALIZATION & DIAGNOSIS APIs
# =============================================================================

class DetectionRequest(BaseModel):
    source: str = "PC1"
    destination: str = "Server"
    probe_count: int = 3


class DiagnosisRequest(BaseModel):
    source: str = "PC1"
    destination: str = "Server"


@app.get("/api/faults/active", response_model=List[FaultScenario])
def get_active_faults():
    """Returns list of currently active injected fault conditions."""
    return fault_engine.get_active_faults()


@app.get("/api/faults/scenarios")
def get_available_scenarios():
    """Returns pre-configured catalog of controlled test scenarios."""
    return fault_engine.get_available_scenarios()


@app.post("/api/faults/inject", response_model=FaultScenario)
def inject_fault(request: FaultInjectionRequest):
    """
    Injects a controlled, reversible network fault (Link, Node, or Interface).
    """
    try:
        scenario = fault_engine.inject_fault(request)
        return scenario
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faults/restore")
def restore_fault(request: FaultRestoreRequest):
    """
    Restores an active fault by ID, or all faults if ID is omitted.
    """
    if request.fault_id:
        success = fault_engine.restore_fault(request.fault_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Active fault '{request.fault_id}' not found")
        return {"status": "ok", "message": f"Fault '{request.fault_id}' restored successfully", "restored_count": 1}
    else:
        restored = fault_engine.restore_all_faults()
        return {"status": "ok", "message": "All active faults restored successfully", "restored_count": restored}


@app.post("/api/diagnosis/detect", response_model=FailureObservation)
def detect_failure(request: DetectionRequest):
    """
    Executes discrete probe telemetry and captures empirical failure observation data.
    """
    if not topology_engine.has_node(request.source):
        raise HTTPException(status_code=404, detail=f"Source node '{request.source}' not found")
    if not topology_engine.has_node(request.destination):
        raise HTTPException(status_code=404, detail=f"Destination node '{request.destination}' not found")

    return observation_engine.observe_flow(
        source=request.source,
        destination=request.destination,
        probe_count=request.probe_count,
    )


@app.post("/api/diagnosis/diagnose", response_model=Module3DiagnosisResult)
def run_diagnosis(request: DiagnosisRequest):
    """
    Executes full evidence-based diagnostic inference workflow:
    Observation -> Localization -> Candidate Hypotheses -> Targeted Investigation -> Diagnosis.
    """
    if not topology_engine.has_node(request.source):
        raise HTTPException(status_code=404, detail=f"Source node '{request.source}' not found")
    if not topology_engine.has_node(request.destination):
        raise HTTPException(status_code=404, detail=f"Destination node '{request.destination}' not found")

    return diagnosis_engine.diagnose(
        source=request.source,
        destination=request.destination,
    )


@app.post("/api/diagnosis/from-handoff", response_model=Module3DiagnosisResult)
def diagnose_from_handoff(handoff: FailureHandoff):
    """
    Accepts FailureHandoff from Module 2 campaign and runs evidence-based diagnosis.
    """
    return diagnosis_engine.diagnose_from_handoff(handoff)


@app.get("/api/diagnosis/impact", response_model=ImpactAnalysisResult)
def get_failure_impact():
    """
    Calculates network-wide blast radius, segregating affected vs unaffected flows
    using Module 1's NetworkIntelligenceEngine.
    """
    active_faults = fault_engine.get_active_faults()
    suspected = [f.target_link or f.target_node or f.fault_id for f in active_faults]
    return impact_engine.analyze_impact(suspected_components=suspected)


# =============================================================================
# MODULE 4: Causal Resilience, What-If Analysis & Integrated Investigation
# =============================================================================

@app.post("/api/resilience/what-if", response_model=WhatIfResponse)
def simulate_what_if(request: WhatIfRequest):
    """
    Lightweight What-If Resilience Engine.
    Simulates prospective failure of any link or node without altering active topology.
    """
    return what_if_engine.simulate_what_if(request)


class StartInvestigationRequest(BaseModel):
    source: str = "PC1"
    destination: str = "Server"
    fault_target: str = "R2-R3"
    fault_type: str = "LINK_FAILURE"
    reproduction_runs: int = 3


@app.post("/api/investigation/run", response_model=FullInvestigationRecord)
def run_full_investigation(request: Optional[StartInvestigationRequest] = None):
    """
    Executes complete end-to-end 11-stage automated failure investigation across Modules 1-4.
    """
    req = request or StartInvestigationRequest()
    return investigation_engine.run_investigation(
        source=req.source,
        destination=req.destination,
        fault_target=req.fault_target,
        fault_type_str=req.fault_type,
        reproduction_runs=req.reproduction_runs,
    )


@app.get("/api/investigation/history", response_model=List[FullInvestigationRecord])
def get_investigation_history():
    """
    Returns history of executed full investigations.
    """
    return investigation_engine.get_history()


@app.get("/api/investigation/{inv_id}", response_model=FullInvestigationRecord)
def get_investigation_by_id(inv_id: str):
    """
    Returns specific investigation record by ID.
    """
    record = next((r for r in investigation_engine.get_history() if r.investigation_id == inv_id), None)
    if not record:
        raise HTTPException(status_code=404, detail=f"Investigation record '{inv_id}' not found")
    return record




export interface TopologyNode {
  id: string;
  name: string;
  type: string; // "router" | "host" | "switch" | "server"
  health_status?: string; // "up" | "down" | "unknown"
  x?: number;
  y?: number;
}

export interface TopologyLink {
  source: string;
  destination: string;
  status: string; // "up" | "down"
}

export interface TopologyData {
  nodes: TopologyNode[];
  links: TopologyLink[];
}

export interface ProbeEvent {
  sequence: number;
  timestamp_ms: number;
  event_type: "PROBE_CREATED" | "PACKET_CREATED" | "SENT" | "FORWARDED" | "RECEIVED" | "DROPPED" | "TIMEOUT";
  current_node: string;
  next_node?: string | null;
  link_id?: string | null;
  packet_id: string;
  details: string;
  hop_number: number;
}

export interface SingleProbeTrace {
  probe_index: number;
  packet_id: string;
  status: string;
  rtt_ms?: number | null;
  hops_traversed: string[];
  drop_node?: string | null;
  drop_link?: string | null;
  drop_reason?: string | null;
  events: ProbeEvent[];
}

export interface ProbeSimulationResult {
  source: string;
  destination: string;
  probes_sent: number;
  probes_received: number;
  probes_dropped: number;
  packet_loss_percentage: number;
  avg_rtt_ms?: number | null;
  network_reachability_status: string;
  nominal_path: string[];
  observed_path: string[];
  all_events: ProbeEvent[];
  probe_details: SingleProbeTrace[];
  empirical_observation: string;
}

export interface DiagnosisResult {
  detected_failure: boolean;
  symptom: string;
  observation_summary: string;
  suspected_component_type?: string | null;
  suspected_component_id?: string | null;
  confidence: string;
  isolation_assessment: string;
  recommended_action: string;
}

export interface HealthTestResponse {
  simulation: ProbeSimulationResult;
  diagnosis: DiagnosisResult;
}

export interface FailureSignatureData {
  active: boolean;
  message: string;
  source?: string | null;
  destination?: string | null;
  baseline_path?: string[] | null;
  reachable?: boolean | null;
  path?: string[] | null;
  packet_loss?: number | null;
  fault_type?: string | null;
  failed_component?: string | null;
  routing_change?: boolean | null;
  link_state?: string | null;
}

export interface DependencyNode {
  id: string;
  type: string;
  label: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface CausalDependencyResponse {
  active: boolean;
  message: string;
  graph?: DependencyGraph | null;
}

export interface SignatureComparison {
  match: boolean;
  preserved_fields: string[];
  changed_fields: string[];
}

export interface DependencyComparison {
  match: boolean;
  preserved_relationships: string[];
  missing_relationships: string[];
}

export interface CandidateEvaluationResult {
  candidate: string;
  candidate_type: string;
  action: string;
  status: string;
  signature_match: boolean;
  dependency_match: boolean;
  signature_comparison: SignatureComparison;
  dependency_comparison: DependencyComparison;
  preserved_fields: string[];
  changed_fields: string[];
  preserved_relationships: string[];
  missing_relationships: string[];
  message: string;
}

export interface ReductionExperimentResponse {
  original_topology: TopologyData;
  target_failure: FailureSignatureData;
  target_dependencies: DependencyGraph;
  candidate_evaluations: CandidateEvaluationResult[];
  accepted_candidates: string[];
  rejected_candidates: string[];
  final_topology: TopologyData;
  final_failure_signature?: FailureSignatureData | null;
  final_causal_dependencies?: DependencyGraph | null;
  message: string;
}

export interface ReproductionRun {
  run_number: number;
  status: string;
  signature_match: boolean;
  dependency_match: boolean;
  baseline_path_match: boolean;
  message: string;
}

export interface ReproductionResponse {
  target_failure: FailureSignatureData;
  target_dependencies: DependencyGraph;
  reduced_topology: TopologyData;
  total_runs: number;
  successful_runs: number;
  reproduction_validated: boolean;
  runs: ReproductionRun[];
  final_signature?: FailureSignatureData | null;
  final_dependencies?: DependencyGraph | null;
  message: string;
}

export interface ExperimentSummaryMetrics {
  original_nodes: number;
  original_links: number;
  reduced_nodes: number;
  reduced_links: number;
  nodes_removed: number;
  links_removed: number;
  accepted_candidates: string[];
  rejected_candidates: string[];
  reproduction_runs: number;
  successful_runs: number;
  reproduction_validated: boolean;
}

export interface CompleteExperimentResponse {
  experiment_status: string;
  baseline_topology: TopologyData;
  target_failure: FailureSignatureData;
  target_signature: FailureSignatureData;
  target_dependencies: DependencyGraph;
  reduction_result: ReductionExperimentResponse;
  reproduction_result: ReproductionResponse;
  summary_metrics: ExperimentSummaryMetrics;
  generated_at?: string;
}

// =============================================================================
// Module 2: Intelligent Testing & Orchestration Types
// =============================================================================

export type TestStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "SKIPPED"
  | "BLOCKED";

export type TestCategory =
  | "CONNECTIVITY"
  | "PATH"
  | "REACHABILITY"
  | "ALTERNATE_PATH"
  | "BRANCH_ISOLATION"
  | "RECOVERY"
  | "LINK_INVESTIGATION"
  | "NODE_INVESTIGATION"
  | "INTERFACE_INVESTIGATION";

export type CampaignStatus =
  | "NOT_STARTED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";

export interface NetworkTestDefinition {
  test_id: string;
  name: string;
  category: TestCategory;
  purpose: string;
  preconditions: string[];
  description: string;
  is_automated_eligible?: boolean;
}

export interface TestObservation {
  metric: string;
  value: any;
  interpretation: string;
}

export interface TestResult {
  test_id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  source: string;
  destination: string;
  sequence_number: number;
  timestamp_ms: number;
  duration_ms: number;
  expected_result: string;
  actual_result: string;
  observations: string[];
  structured_observations: TestObservation[];
  simulation_result?: ProbeSimulationResult | null;
  failure_detected: boolean;
  drop_node?: string | null;
  drop_link?: string | null;
  drop_reason?: string | null;
  nominal_path: string[];
  observed_path: string[];
  follow_up_recommendations: string[];
}

export interface NextTestDecision {
  test_id: string;
  name: string;
  category: TestCategory;
  target_source: string;
  target_destination: string;
  reason: string;
  evidence: string[];
  confidence: string;
  parameters?: Record<string, any>;
}

export interface FailureHandoff {
  failure_detected: boolean;
  symptom: string;
  source: string;
  destination: string;
  observed_path: string[];
  drop_node?: string | null;
  drop_link?: string | null;
  drop_reason?: string | null;
  packet_loss_percentage: number;
  affected_components: string[];
  isolated_healthy_branches: string[];
  evidence: string[];
  recommended_diagnosis_target?: string | null;
  ready_for_diagnosis: boolean;
}

export interface TestCampaign {
  id: string;
  name: string;
  network_name: string;
  source: string;
  destination: string;
  mode: "automated" | "manual";
  status: CampaignStatus;
  current_step_index: number;
  executed_tests: TestResult[];
  next_test_recommendation?: NextTestDecision | null;
  failure_handoff?: FailureHandoff | null;
  summary: string;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Module 1: Network Intelligence & Path Analysis Types
// =============================================================================

export interface PathInfo {
  path_id: string;
  hops: string[];
  hop_count: number;
  links: string[];
  status: "active" | "degraded" | "blocked";
  is_primary: boolean;
  cost: number;
}

export interface PathQueryResponse {
  source: string;
  destination: string;
  reachable: boolean;
  primary_path?: PathInfo | null;
  hop_count: number;
  nodes_traversed: string[];
  links_traversed: string[];
  path_cost: number;
  alternate_paths_available: number;
  selection_rule: string;
  bottlenecks: string[];
}

export interface AlternatePathsResponse {
  source: string;
  destination: string;
  reachable: boolean;
  primary_path?: PathInfo | null;
  alternate_paths: PathInfo[];
  total_physical_paths: number;
  active_alternate_paths: number;
  redundancy_status: "HIGH" | "PARTIAL" | "NONE";
}

export interface PathComparisonRequest {
  path_a: string[];
  path_b: string[];
}

export interface PathComparisonResponse {
  path_a: string[];
  path_b: string[];
  hop_count_a: number;
  hop_count_b: number;
  hop_difference: number;
  common_nodes: string[];
  common_links: string[];
  unique_nodes_a: string[];
  unique_nodes_b: string[];
  unique_links_a: string[];
  unique_links_b: string[];
  shared_dependency_points: string[];
  similarity_percentage: number;
}

export interface ReachabilityCell {
  source: string;
  destination: string;
  status: "REACHABLE" | "UNREACHABLE" | "SAME_NODE";
  hop_count?: number | null;
  path?: string[] | null;
}

export interface ReachabilityMatrixResponse {
  endpoints: string[];
  matrix: Record<string, Record<string, ReachabilityCell>>;
  total_pairs: number;
  reachable_pairs: number;
  unreachable_pairs: number;
  network_health_percentage: number;
}

export interface DependentFlow {
  source: string;
  destination: string;
  path: string[];
  hops: number;
}

export interface ComponentDependencyResponse {
  component_type: "link" | "node";
  component_id: string;
  status: string;
  dependent_flows: DependentFlow[];
  dependent_flow_count: number;
  has_alternate_bypass: boolean;
  criticality: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
}

// =============================================================================
// Module 3: Fault Injection, Failure Observation, Localization & Diagnosis Types
// =============================================================================

export type FaultType =
  | "LINK_FAILURE"
  | "NODE_FAILURE"
  | "INTERFACE_FAILURE"
  | "PACKET_LOSS"
  | "PACKET_DELAY";

export interface FaultScenario {
  fault_id: string;
  fault_type: FaultType;
  target_node?: string | null;
  target_link?: string | null;
  target_interface_node?: string | null;
  target_interface_remote?: string | null;
  description: string;
  is_active: boolean;
  created_at?: number;
  metadata?: Record<string, any>;
}

export interface FaultInjectionRequest {
  fault_type: FaultType;
  target_node?: string | null;
  target_link?: string | null;
  target_interface_node?: string | null;
  target_interface_remote?: string | null;
  parameters?: Record<string, any> | null;
}

export interface FailureObservation {
  source: string;
  destination: string;
  reachability_status: "HEALTHY" | "DEGRADED" | "FAILED";
  probes_sent: number;
  probes_delivered: number;
  probes_dropped: number;
  packet_loss_percentage: number;
  avg_rtt_ms?: number | null;
  nominal_path: string[];
  observed_path: string[];
  last_reachable_node?: string | null;
  failed_transition?: string | null;
  failed_link?: string | null;
  drop_reason?: string | null;
  node_states_observed: Record<string, string>;
  link_states_observed: Record<string, string>;
  healthy_branches: string[];
  timestamp_ms: number;
  evidence_log: string[];
}

export interface LocalizationResult {
  last_reachable_node: string;
  first_failed_transition?: string | null;
  suspected_link?: string | null;
  suspected_interface?: string | null;
  suspected_node?: string | null;
  candidate_components: string[];
  localization_notes: string;
}

export type HypothesisCategory = "LINK" | "NODE" | "INTERFACE" | "ROUTING";
export type HypothesisStatus = "CONFIRMED" | "PROBABLE" | "UNLIKELY" | "REFUTED";

export interface Hypothesis {
  hypothesis_id: string;
  title: string;
  category: HypothesisCategory;
  target: string;
  confidence_score: number;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  status: HypothesisStatus;
  supporting_evidence: string[];
  contradicting_evidence: string[];
  targeted_test_conducted: string;
  targeted_test_result: string;
}

export type DiagnosisStatus =
  | "FAILURE_CONFIRMED"
  | "FAILURE_PROBABLE"
  | "AMBIGUOUS"
  | "NO_FAILURE_DETECTED";

export interface Module3DiagnosisResult {
  status: DiagnosisStatus;
  primary_cause?: Hypothesis | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  localization?: LocalizationResult | null;
  candidate_hypotheses: Hypothesis[];
  supporting_evidence: string[];
  contradicting_evidence: string[];
  recommended_action: string;
  summary: string;
}

export type FailureScope = "NONE" | "LOCALIZED" | "PARTITIONED" | "WIDESPREAD";

export interface ImpactedFlow {
  source: string;
  destination: string;
  status: "FAILED" | "DEGRADED" | "HEALTHY";
  path: string[];
  hops: number;
  traverses_failed_component: boolean;
}

export interface ImpactAnalysisResult {
  failure_scope: FailureScope;
  failed_components: string[];
  total_flows_evaluated: number;
  affected_flows_count: number;
  unaffected_flows_count: number;
  affected_flows: ImpactedFlow[];
  unaffected_flows: ImpactedFlow[];
  isolated_endpoints: string[];
  summary: string;
}

export interface WhatIfFlowSummary {
  source: string;
  destination: string;
  before_path: string[];
  after_path?: string[] | null;
  status: "HEALTHY" | "REROUTED" | "DISRUPTED";
}

export interface WhatIfResponse {
  target_component: string;
  target_type: string;
  source: string;
  destination: string;
  before_reachable: boolean;
  before_path: string[];
  after_reachable: boolean;
  after_path?: string[] | null;
  has_alternate_path: boolean;
  alternate_paths: string[][];
  affected_flows_count: number;
  unaffected_flows_count: number;
  affected_flows: WhatIfFlowSummary[];
  unaffected_flows: WhatIfFlowSummary[];
  failure_scope: FailureScope;
  resilience_assessment: string;
}

export interface InvestigationStage {
  stage_id: string;
  stage_number: number;
  name: string;
  status: string;
  summary: string;
  details: Record<string, any>;
}

export interface FullInvestigationRecord {
  investigation_id: string;
  timestamp: number;
  source: string;
  destination: string;
  fault_target: string;
  stages: InvestigationStage[];
  baseline_topology: TopologyData;
  baseline_path: string[];
  observation: FailureObservation;
  localization: LocalizationResult;
  diagnosis: Module3DiagnosisResult;
  impact: ImpactAnalysisResult;
  signature: FailureSignatureData;
  causal_dependencies: DependencyGraph;
  reduction: ReductionExperimentResponse;
  reproduction: ReproductionResponse;
  what_if?: WhatIfResponse | null;
  summary_verdict: string;
}





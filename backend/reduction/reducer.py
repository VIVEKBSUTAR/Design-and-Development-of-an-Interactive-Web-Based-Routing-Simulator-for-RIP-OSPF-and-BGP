from typing import List, Optional, Dict, Tuple
import networkx as nx
from topology.network import NetworkTopology, TopologyData
from failure.signature import FailureSignatureGenerator, FailureSignature
from causal.dependency import (
    CausalDependencyGenerator,
    DependencyGraph,
    DependencyNodeType,
    DependencyRelationship,
)
from reduction.models import (
    SignatureComparison,
    DependencyComparison,
    CandidateEvaluationResult,
    ReductionExperimentResponse,
)


def compare_signatures(
    target: FailureSignature, candidate: Optional[FailureSignature]
) -> SignatureComparison:
    """
    Deterministically compares target failure signature with candidate failure signature.
    Requires equivalence of core observable failure properties, including pre-failure baseline path.
    """
    fields_to_compare = [
        "source",
        "destination",
        "baseline_path",
        "fault_type",
        "failed_component",
        "reachable",
        "packet_loss",
        "link_state",
        "path",
    ]

    if candidate is None:
        return SignatureComparison(
            match=False,
            preserved_fields=[],
            changed_fields=["signature_missing"],
        )

    preserved: List[str] = []
    changed: List[str] = []

    for field in fields_to_compare:
        target_val = getattr(target, field)
        candidate_val = getattr(candidate, field)
        if target_val == candidate_val:
            preserved.append(field)
        else:
            changed.append(field)

    return SignatureComparison(
        match=(len(changed) == 0),
        preserved_fields=preserved,
        changed_fields=changed,
    )


def compare_dependencies(
    target: DependencyGraph, candidate: Optional[DependencyGraph]
) -> DependencyComparison:
    """
    Compares target causal dependency graph with candidate causal dependency graph.
    Verifies that all causal relationships present in target are strictly preserved in candidate.
    """
    if target is None or len(target.nodes) == 0:
        return DependencyComparison(
            match=False,
            preserved_relationships=[],
            missing_relationships=["target_dependencies_missing"],
        )

    # Build node id -> type map for target
    target_node_map: Dict[str, DependencyNodeType] = {
        node.id: node.type for node in target.nodes
    }

    # Extract target transitions: (source_type, relationship, target_type)
    target_transitions = set()
    for edge in target.edges:
        s_type = target_node_map.get(edge.source)
        t_type = target_node_map.get(edge.target)
        if s_type and t_type:
            target_transitions.add((s_type, edge.relationship, t_type))

    if candidate is None or len(candidate.nodes) == 0:
        missing_steps = [
            f"{s.value} -[{r.value}]-> {t.value}"
            for s, r, t in target_transitions
        ]
        return DependencyComparison(
            match=False,
            preserved_relationships=[],
            missing_relationships=sorted(missing_steps),
        )

    # Build node id -> type map for candidate
    cand_node_map: Dict[str, DependencyNodeType] = {
        node.id: node.type for node in candidate.nodes
    }

    # Extract candidate transitions
    candidate_transitions = set()
    for edge in candidate.edges:
        s_type = cand_node_map.get(edge.source)
        t_type = cand_node_map.get(edge.target)
        if s_type and t_type:
            candidate_transitions.add((s_type, edge.relationship, t_type))

    preserved: List[str] = []
    missing: List[str] = []

    for s_type, rel, t_type in target_transitions:
        step_desc = f"{s_type.value} -[{rel.value}]-> {t_type.value}"
        if (s_type, rel, t_type) in candidate_transitions:
            preserved.append(step_desc)
        else:
            missing.append(step_desc)

    is_match = (
        len(missing) == 0
        and len(target_transitions) > 0
        and len(candidate_transitions) == len(target_transitions)
    )

    return DependencyComparison(
        match=is_match,
        preserved_relationships=sorted(preserved),
        missing_relationships=sorted(missing),
    )


class FailureReducer:
    """
    Controlled reduction algorithm that evaluates candidate components for removal
    while strictly preserving the target failure signature and causal dependencies.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        failure_generator: FailureSignatureGenerator,
        causal_generator: CausalDependencyGenerator,
    ):
        self.topology = topology
        self.failure_generator = failure_generator
        self.causal_generator = causal_generator

    def evaluate_candidate(
        self,
        candidate: str,
        target_sig: FailureSignature,
        target_deps: DependencyGraph,
        source: str = "PC1",
        destination: str = "Server",
    ) -> CandidateEvaluationResult:
        """
        Temporarily removes a candidate node, tests failure behavior, and
        decides ACCEPTED/REJECTED purely from signature_match and dependency_match.
        Rolls back topology if rejected.

        Execution ordering:
        1. Start with current topology snapshot.
        2. Temporarily remove candidate.
        3. Ensure all links are UP.
        4. Capture the pre-failure baseline path.
        5. Only AFTER capturing the baseline path, inject R2-R3 failure.
        6. Generate candidate failure signature.
        7. Generate candidate causal dependencies.
        8. Compare against target.
        """
        # 1. Start with current topology snapshot
        snapshot = self.topology.snapshot()

        # Check candidate existence
        if candidate not in self.topology.graph:
            return CandidateEvaluationResult(
                candidate=candidate,
                candidate_type="NODE",
                action="REMOVE",
                status="REJECTED",
                signature_match=False,
                dependency_match=False,
                signature_comparison=SignatureComparison(match=False, preserved_fields=[], changed_fields=["node_not_found"]),
                dependency_comparison=DependencyComparison(match=False, preserved_relationships=[], missing_relationships=["node_not_found"]),
                preserved_fields=[],
                changed_fields=["node_not_found"],
                preserved_relationships=[],
                missing_relationships=["node_not_found"],
                message=f"Candidate node '{candidate}' does not exist in active topology",
            )

        # 2. Temporarily remove candidate
        self.topology.remove_node(candidate)

        # 3. Ensure all remaining links in the candidate topology are UP
        for u, v in list(self.topology.graph.edges()):
            self.topology.graph[u][v]["status"] = "up"

        # 4. Capture pre-failure baseline path BEFORE injecting any failure
        if self.topology.has_path(source, destination):
            candidate_baseline_path = self.topology.get_path(source, destination)
        else:
            candidate_baseline_path = None

        # 5. Only AFTER capturing baseline path, inject R2-R3 failure
        self.topology.fail_link("R2", "R3")

        # 6. Generate candidate failure signature
        candidate_sig = self.failure_generator.generate_signature(
            source=source,
            destination=destination,
            baseline_path=candidate_baseline_path,
        )
        sig_comparison = compare_signatures(target_sig, candidate_sig)

        # 7. Generate candidate causal dependencies
        candidate_deps = self.causal_generator.generate_dependencies(
            source=source,
            destination=destination,
            baseline_path=candidate_baseline_path,
        )
        dep_comparison = compare_dependencies(target_deps, candidate_deps)

        # 8. Core Decision Rule:
        # ACCEPTED ONLY WHEN BOTH signature_match == True AND dependency_match == True
        is_accepted = sig_comparison.match and dep_comparison.match

        if is_accepted:
            status = "ACCEPTED"
            message = (
                f"Candidate '{candidate}' accepted: failure signature and causal dependencies preserved"
            )
            # Removal is retained
        else:
            status = "REJECTED"
            message = (
                f"Candidate '{candidate}' rejected: failure signature or causal dependencies not preserved"
            )
            # Restore previous state
            self.topology.restore_snapshot(snapshot)

        return CandidateEvaluationResult(
            candidate=candidate,
            candidate_type="NODE",
            action="REMOVE",
            status=status,
            signature_match=sig_comparison.match,
            dependency_match=dep_comparison.match,
            signature_comparison=sig_comparison,
            dependency_comparison=dep_comparison,
            preserved_fields=sig_comparison.preserved_fields,
            changed_fields=sig_comparison.changed_fields,
            preserved_relationships=dep_comparison.preserved_relationships,
            missing_relationships=dep_comparison.missing_relationships,
            message=message,
        )

    def run_reduction_experiment(
        self,
        candidates: Optional[List[str]] = None,
        source: str = "PC1",
        destination: str = "Server",
    ) -> ReductionExperimentResponse:
        """
        Executes the controlled reduction experiment:
        1. Start with current topology and reset to default demo topology.
        2. Ensure all links are UP.
        3. Capture the pre-failure baseline path.
        4. Only AFTER capturing baseline path, inject R2-R3 failure.
        5. Generate target failure signature including baseline_path.
        6. Generate target causal dependencies.
        7. Evaluate candidate set sequentially following the exact same ordering.
        8. Return reduced topology preserving target failure behavior.
        """
        if candidates is None:
            # Deterministic candidate set including non-essential candidates (PC2, R4)
            # and demonstrating rejection of essential component (R1)
            candidates = ["PC2", "R4", "R1"]

        # Step 1: Start with topology reset
        self.topology.reset()

        # Step 2: Ensure all links are UP
        for u, v in list(self.topology.graph.edges()):
            self.topology.graph[u][v]["status"] = "up"

        # Step 3: Capture the pre-failure baseline path
        target_baseline_path = self.topology.get_path(source, destination)

        original_topology = self.topology.get_topology_data()

        # Step 4: Only AFTER capturing baseline path, inject R2-R3 failure
        self.topology.fail_link("R2", "R3")

        # Step 5: Generate target failure signature including baseline_path
        target_sig = self.failure_generator.generate_signature(
            source=source,
            destination=destination,
            baseline_path=target_baseline_path,
        )
        if target_sig is None:
            raise RuntimeError("Cannot establish baseline failure signature for reduction")

        # Step 6: Generate target causal dependencies
        target_deps = self.causal_generator.generate_dependencies(
            source=source,
            destination=destination,
            baseline_path=target_baseline_path,
        )
        if target_deps is None:
            raise RuntimeError("Cannot establish baseline causal dependencies for reduction")

        # Step 7: Evaluate candidates sequentially
        evaluations: List[CandidateEvaluationResult] = []
        accepted: List[str] = []
        rejected: List[str] = []

        for cand in candidates:
            eval_result = self.evaluate_candidate(
                candidate=cand,
                target_sig=target_sig,
                target_deps=target_deps,
                source=source,
                destination=destination,
            )
            evaluations.append(eval_result)
            if eval_result.status == "ACCEPTED":
                accepted.append(cand)
            else:
                rejected.append(cand)

        # Step 8: Ensure failure condition R2-R3 is active on final reduced topology
        self.topology.fail_link("R2", "R3")
        final_topology = self.topology.get_topology_data()
        final_sig = self.failure_generator.generate_signature(
            source=source,
            destination=destination,
            baseline_path=target_baseline_path,
        )
        final_deps = self.causal_generator.generate_dependencies(
            source=source,
            destination=destination,
            baseline_path=target_baseline_path,
        )

        return ReductionExperimentResponse(
            original_topology=original_topology,
            target_failure=target_sig,
            target_dependencies=target_deps,
            candidate_evaluations=evaluations,
            accepted_candidates=accepted,
            rejected_candidates=rejected,
            final_topology=final_topology,
            final_failure_signature=final_sig,
            final_causal_dependencies=final_deps,
            message="Reduced topology preserving the target failure behavior",
        )

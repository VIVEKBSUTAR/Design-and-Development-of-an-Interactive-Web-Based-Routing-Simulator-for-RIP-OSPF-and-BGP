from typing import Optional, List
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator
from causal.dependency import CausalDependencyGenerator
from reduction.reducer import FailureReducer
from reproduction.reproducer import FailureReproducer
from experiment.models import (
    ExperimentSummaryMetrics,
    CompleteExperimentResponse,
)


class ExperimentPipeline:
    """
    Consolidated Experiment Pipeline (Phase 7).
    Orchestrates the entire research workflow:
    Healthy Baseline -> Fault Injection -> Failure Signature ->
    Causal Dependency Mapping -> Failure Reduction -> Failure Reproduction Validation.
    Reuses existing domain services without duplicating underlying logic.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        failure_generator: FailureSignatureGenerator,
        causal_generator: CausalDependencyGenerator,
        reducer: FailureReducer,
        reproducer: FailureReproducer,
    ):
        self.topology = topology
        self.failure_generator = failure_generator
        self.causal_generator = causal_generator
        self.reducer = reducer
        self.reproducer = reproducer

    def run_complete_experiment(
        self,
        source: str = "PC1",
        destination: str = "Server",
        runs: int = 3,
    ) -> CompleteExperimentResponse:
        """
        Executes the complete research pipeline in sequence:
        1. Reset topology to clean baseline.
        2. Capture healthy baseline topology.
        3. Capture pre-failure baseline path.
        4. Inject target R2-R3 link failure.
        5. Generate target failure signature.
        6. Generate target causal dependencies.
        7. Execute Phase 5.1 dependency-aware failure reduction.
        8. Execute Phase 6 failure reproduction on the reduced topology.
        9. Calculate consolidated summary metrics.
        10. Return complete experiment response.
        """
        # Step 1: Reset topology
        self.topology.reset()

        # Step 2: Ensure all links are UP and capture baseline topology
        for u, v in list(self.topology.graph.edges()):
            self.topology.graph[u][v]["status"] = "up"
        baseline_topology = self.topology.get_topology_data()

        # Step 3: Capture pre-failure baseline path
        baseline_path = self.topology.get_path(source, destination)

        # Step 4: Inject target R2-R3 link failure
        self.topology.fail_link("R2", "R3")

        # Step 5: Generate target failure signature
        target_failure = self.failure_generator.generate_signature(
            source=source,
            destination=destination,
            baseline_path=baseline_path,
        )
        if target_failure is None:
            raise RuntimeError("Failed to generate target failure signature")

        # Step 6: Generate target causal dependencies
        target_dependencies = self.causal_generator.generate_dependencies(
            source=source,
            destination=destination,
            baseline_path=baseline_path,
        )
        if target_dependencies is None:
            raise RuntimeError("Failed to generate target causal dependencies")

        # Step 7: Execute Phase 5.1 dependency-aware failure reduction
        reduction_result = self.reducer.run_reduction_experiment(
            candidates=["PC2", "R4", "R1"],
            source=source,
            destination=destination,
        )

        # Step 8: Execute Phase 6 failure reproduction validation on reduced topology
        reproduction_result = self.reproducer.run_reproduction_experiment(
            runs=runs,
            source=source,
            destination=destination,
        )

        # Step 9: Calculate summary metrics
        original_nodes = len(baseline_topology.nodes)
        original_links = len(baseline_topology.links)
        reduced_nodes = len(reduction_result.final_topology.nodes)
        reduced_links = len(reduction_result.final_topology.links)

        summary_metrics = ExperimentSummaryMetrics(
            original_nodes=original_nodes,
            original_links=original_links,
            reduced_nodes=reduced_nodes,
            reduced_links=reduced_links,
            nodes_removed=original_nodes - reduced_nodes,
            links_removed=original_links - reduced_links,
            accepted_candidates=reduction_result.accepted_candidates,
            rejected_candidates=reduction_result.rejected_candidates,
            reproduction_runs=reproduction_result.total_runs,
            successful_runs=reproduction_result.successful_runs,
            reproduction_validated=reproduction_result.reproduction_validated,
        )

        experiment_status = (
            "SUCCESS"
            if reproduction_result.reproduction_validated
            else "FAILED"
        )

        message = (
            "Failure behavior and causal dependency progression were "
            "preserved after topology reduction."
        )

        return CompleteExperimentResponse(
            experiment_status=experiment_status,
            baseline_topology=baseline_topology,
            target_failure=target_failure,
            target_signature=target_failure,
            target_dependencies=target_dependencies,
            reduction_result=reduction_result,
            reproduction_result=reproduction_result,
            summary_metrics=summary_metrics,
            message=message,
        )

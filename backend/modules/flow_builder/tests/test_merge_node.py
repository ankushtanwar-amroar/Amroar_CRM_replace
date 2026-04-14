import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.modules.flow_builder.runtime.flow_runtime import FlowRuntimeEngine
from backend.modules.flow_builder.models.flow import Flow, Node, Edge, NodeType, FlowExecution, ExecutionStatus


@pytest.mark.asyncio
async def test_merge_node_synchronize_mode():
    """Test MERGE node in synchronize mode (default)"""
    # Mock database
    mock_db = MagicMock()
    mock_db.flow_executions.insert_one = AsyncMock()
    mock_db.flow_executions.update_one = AsyncMock()

    # Create runtime engine
    engine = FlowRuntimeEngine(mock_db)

    # Create a flow with MERGE node
    flow = Flow(
        id="test-merge-flow",
        tenant_id="test-tenant",
        name="Test Merge Flow",
        version=1,
        nodes=[
            Node(
                id="branch1",
                type=NodeType.ACTION,
                label="Branch 1",
                config={"action": "branch1_action"}
            ),
            Node(
                id="branch2",
                type=NodeType.ACTION,
                label="Branch 2",
                config={"action": "branch2_action"}
            ),
            Node(
                id="merge_node",
                type=NodeType.MERGE,
                label="Merge Node",
                config={"merge_mode": "synchronize"}
            ),
            Node(
                id="end_node",
                type=NodeType.END,
                label="End Node",
                config={}
            )
        ],
        edges=[
            Edge(id="e1", source="branch1", target="merge_node"),
            Edge(id="e2", source="branch2", target="merge_node"),
            Edge(id="e3", source="merge_node", target="end_node")
        ]
    )

    # Execute flow
    execution = await engine.execute_flow(flow)

    # Verify execution completed successfully
    assert execution.status == ExecutionStatus.SUCCESS
    assert len(execution.node_executions) == 4

    # Verify MERGE node execution
    merge_exec = next(exec for exec in execution.node_executions if exec.node_id == "merge_node")
    assert merge_exec.status == ExecutionStatus.SUCCESS
    assert merge_exec.output["merge_mode"] == "synchronize"
    assert "source_nodes" in merge_exec.output


@pytest.mark.asyncio
async def test_merge_node_aggregate_outputs_mode():
    """Test MERGE node in aggregate_outputs mode"""
    # Mock database
    mock_db = MagicMock()
    mock_db.flow_executions.insert_one = AsyncMock()
    mock_db.flow_executions.update_one = AsyncMock()

    # Create runtime engine
    engine = FlowRuntimeEngine(mock_db)

    # Create a flow with MERGE node that aggregates outputs
    flow = Flow(
        id="test-aggregate-flow",
        tenant_id="test-tenant",
        name="Test Aggregate Flow",
        version=1,
        nodes=[
            Node(
                id="branch1",
                type=NodeType.ACTION,
                label="Branch 1",
                config={"action": "branch1_action"}
            ),
            Node(
                id="branch2",
                type=NodeType.ACTION,
                label="Branch 2",
                config={"action": "branch2_action"}
            ),
            Node(
                id="merge_node",
                type=NodeType.MERGE,
                label="Merge Node",
                config={
                    "merge_mode": "aggregate_outputs",
                    "output_variable": "aggregated_results"
                }
            ),
            Node(
                id="end_node",
                type=NodeType.END,
                label="End Node",
                config={}
            )
        ],
        edges=[
            Edge(id="e1", source="branch1", target="merge_node"),
            Edge(id="e2", source="branch2", target="merge_node"),
            Edge(id="e3", source="merge_node", target="end_node")
        ]
    )

    # Execute flow
    execution = await engine.execute_flow(flow)

    # Verify execution completed successfully
    assert execution.status == ExecutionStatus.SUCCESS
    assert len(execution.node_executions) == 4

    # Verify MERGE node execution
    merge_exec = next(exec for exec in execution.node_executions if exec.node_id == "merge_node")
    assert merge_exec.status == ExecutionStatus.SUCCESS
    assert merge_exec.output["merge_mode"] == "aggregate_outputs"
    assert "aggregated_results" in execution.context
    assert isinstance(execution.context["aggregated_results"], list)


@pytest.mark.asyncio
async def test_merge_node_default_config():
    """Test MERGE node with default configuration"""
    # Mock database
    mock_db = MagicMock()
    mock_db.flow_executions.insert_one = AsyncMock()
    mock_db.flow_executions.update_one = AsyncMock()

    # Create runtime engine
    engine = FlowRuntimeEngine(mock_db)

    # Create a flow with MERGE node using default config
    flow = Flow(
        id="test-default-merge-flow",
        tenant_id="test-tenant",
        name="Test Default Merge Flow",
        version=1,
        nodes=[
            Node(
                id="start",
                type=NodeType.ACTION,
                label="Start",
                config={"action": "start_action"}
            ),
            Node(
                id="merge_node",
                type=NodeType.MERGE,
                label="Merge Node",
                config={}  # Empty config should use defaults
            ),
            Node(
                id="end_node",
                type=NodeType.END,
                label="End Node",
                config={}
            )
        ],
        edges=[
            Edge(id="e1", source="start", target="merge_node"),
            Edge(id="e2", source="merge_node", target="end_node")
        ]
    )

    # Execute flow
    execution = await engine.execute_flow(flow)

    # Verify execution completed successfully
    assert execution.status == ExecutionStatus.SUCCESS
    assert len(execution.node_executions) == 3

    # Verify MERGE node execution with defaults
    merge_exec = next(exec for exec in execution.node_executions if exec.node_id == "merge_node")
    assert merge_exec.status == ExecutionStatus.SUCCESS
    assert merge_exec.output["merge_mode"] == "synchronize"  # Default mode
    assert "source_nodes" in merge_exec.output

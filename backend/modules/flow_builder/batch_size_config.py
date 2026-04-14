"""
Flow Batch Size Configuration
Manages batch/chunk size settings for flow execution
Matches Salesforce Flow batching behavior
"""

class BatchSizeConfig:
    """
    Configuration constants for flow batch size
    Matches Salesforce Flow limits and recommendations
    """
    
    # Default batch size (Salesforce uses 200 for triggers, we use 50 for safety)
    DEFAULT_BATCH_SIZE = 50
    
    # Minimum batch size (at least 1 record per batch)
    MIN_BATCH_SIZE = 1
    
    # Maximum batch size (Salesforce limit is typically 200-2000 depending on context)
    MAX_BATCH_SIZE = 500
    
    # Recommended safe upper limit (performance vs throughput balance)
    RECOMMENDED_MAX = 200
    
    # Flow types that support batching
    BATCH_ENABLED_FLOW_TYPES = {
        'record_triggered',
        'scheduled',
        'webhook',
    }
    
    # Flow types that do NOT use batching
    BATCH_DISABLED_FLOW_TYPES = {
        'screen_flow',
        'autolaunched',  # Unless explicitly called with bulk data
    }
    
    @classmethod
    def get_default_batch_size(cls) -> int:
        """Get default batch size"""
        return cls.DEFAULT_BATCH_SIZE
    
    @classmethod
    def validate_batch_size(cls, batch_size: int) -> tuple:
        """
        Validate batch size value
        
        Args:
            batch_size: Batch size to validate
            
        Returns:
            Tuple of (is_valid, error_message, warning_message)
        """
        if not isinstance(batch_size, int):
            return (False, "Batch size must be an integer", None)
        
        if batch_size < cls.MIN_BATCH_SIZE:
            return (False, f"Batch size must be at least {cls.MIN_BATCH_SIZE}", None)
        
        if batch_size > cls.MAX_BATCH_SIZE:
            return (False, f"Batch size cannot exceed {cls.MAX_BATCH_SIZE}", None)
        
        # Non-blocking warning for large batch sizes
        warning = None
        if batch_size > cls.RECOMMENDED_MAX:
            warning = (
                f"Batch size {batch_size} exceeds recommended maximum of {cls.RECOMMENDED_MAX}. "
                f"Large batch sizes may impact performance or hit API limits."
            )
        
        return (True, None, warning)
    
    @classmethod
    def should_use_batching(cls, flow_type: str) -> bool:
        """
        Determine if flow type should use batching
        
        Args:
            flow_type: Type of flow
            
        Returns:
            True if batching should be applied, False otherwise
            
        Salesforce Rule:
            - Trigger Flows: Always batched
            - Scheduled Flows: Always batched
            - Webhook Flows: Batched if multiple records
            - Screen Flows: No batching (user-driven)
        """
        # Normalize flow type (handle hyphens and underscores)
        normalized_type = flow_type.replace('-', '_') if flow_type else ''
        
        return normalized_type in cls.BATCH_ENABLED_FLOW_TYPES
    
    @classmethod
    def get_effective_batch_size(cls, flow_config: dict) -> int:
        """
        Get effective batch size for a flow
        
        Args:
            flow_config: Flow configuration dict
            
        Returns:
            Effective batch size (from config or default)
        """
        # Get batch size from config, default if not set
        batch_size = flow_config.get('batch_size')
        
        if batch_size is None or batch_size <= 0:
            return cls.DEFAULT_BATCH_SIZE
        
        # Ensure within valid range
        batch_size = max(cls.MIN_BATCH_SIZE, min(batch_size, cls.MAX_BATCH_SIZE))
        
        return batch_size


def partition_records(records: list, batch_size: int) -> list:
    """
    Partition records into batches based on batch size
    
    Args:
        records: List of records to partition
        batch_size: Number of records per batch
        
    Returns:
        List of batches (each batch is a list of records)
        
    Example:
        records = [1, 2, 3, 4, 5, 6, 7]
        batch_size = 3
        result = [[1, 2, 3], [4, 5, 6], [7]]
    """
    if not records:
        return []
    
    if batch_size <= 0:
        batch_size = BatchSizeConfig.DEFAULT_BATCH_SIZE
    
    batches = []
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        batches.append(batch)
    
    return batches


def get_batch_info(total_records: int, batch_size: int) -> dict:
    """
    Get information about batching for a given record count
    
    Args:
        total_records: Total number of records
        batch_size: Batch size
        
    Returns:
        Dict with batch information
    """
    if batch_size <= 0:
        batch_size = BatchSizeConfig.DEFAULT_BATCH_SIZE
    
    num_batches = (total_records + batch_size - 1) // batch_size  # Ceiling division
    
    return {
        'total_records': total_records,
        'batch_size': batch_size,
        'num_batches': num_batches,
        'last_batch_size': total_records % batch_size if total_records % batch_size != 0 else batch_size,
    }

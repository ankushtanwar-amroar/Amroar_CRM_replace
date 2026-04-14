"""
Global Search Ranking Service
Handles result ranking and scoring.

Responsibilities:
- Calculate match quality scores
- Apply object priority weights
- Sort results optimally
"""
from typing import Dict, List, Any, Tuple
import re
import logging

logger = logging.getLogger(__name__)


class SearchRankingService:
    """
    Ranks search results based on multiple factors.
    """
    
    # Scoring weights
    EXACT_MATCH_SCORE = 100
    PREFIX_MATCH_SCORE = 80
    CONTAINS_MATCH_SCORE = 60
    TOKEN_MATCH_SCORE = 40
    
    # Field importance weights
    FIELD_WEIGHTS = {
        'name': 3.0,
        'first_name': 2.8,
        'last_name': 2.8,
        'account_name': 2.5,
        'subject': 2.5,
        'email': 2.0,
        'phone': 1.5,
        'company': 1.5,
        'title': 1.2,
    }
    
    def __init__(self, object_priorities: Dict[str, int] = None):
        self.object_priorities = object_priorities or {}
    
    def score_match(
        self, 
        query: str, 
        value: str, 
        field_name: str
    ) -> Tuple[float, str]:
        """
        Calculate match score between query and field value.
        
        Returns: (score, match_type)
        """
        if not value or not query:
            return 0, None
        
        query_lower = query.lower().strip()
        value_lower = str(value).lower().strip()
        
        # Get field weight
        field_weight = self.FIELD_WEIGHTS.get(field_name.lower(), 1.0)
        
        # Exact match
        if value_lower == query_lower:
            return self.EXACT_MATCH_SCORE * field_weight, 'exact'
        
        # Prefix match
        if value_lower.startswith(query_lower):
            return self.PREFIX_MATCH_SCORE * field_weight, 'prefix'
        
        # Contains match
        if query_lower in value_lower:
            return self.CONTAINS_MATCH_SCORE * field_weight, 'contains'
        
        # Tokenized match ("john acme" -> finds "John at Acme Corp")
        query_tokens = set(query_lower.split())
        value_tokens = set(value_lower.split())
        
        if query_tokens and query_tokens.issubset(value_tokens):
            return self.TOKEN_MATCH_SCORE * field_weight, 'token'
        
        # Partial token match
        matched_tokens = 0
        for qt in query_tokens:
            for vt in value_tokens:
                if qt in vt or vt.startswith(qt):
                    matched_tokens += 1
                    break
        
        if matched_tokens > 0:
            match_ratio = matched_tokens / len(query_tokens)
            return self.TOKEN_MATCH_SCORE * match_ratio * field_weight, 'partial_token'
        
        return 0, None
    
    def calculate_record_score(
        self,
        query: str,
        record: Dict[str, Any],
        searchable_fields: List[Dict[str, Any]]
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculate overall score for a record.
        
        Returns: (total_score, match_details)
        """
        total_score = 0
        match_details = {
            "matched_fields": [],
            "best_match": None,
            "best_match_type": None
        }
        
        best_score = 0
        
        for field in searchable_fields:
            field_name = field["name"]
            field_value = record.get("data", {}).get(field_name) or record.get(field_name)
            
            if field_value:
                score, match_type = self.score_match(query, str(field_value), field_name)
                
                if score > 0:
                    total_score += score
                    match_details["matched_fields"].append({
                        "field": field_name,
                        "value": field_value,
                        "score": score,
                        "match_type": match_type
                    })
                    
                    if score > best_score:
                        best_score = score
                        match_details["best_match"] = field_name
                        match_details["best_match_type"] = match_type
        
        return total_score, match_details
    
    def rank_results(
        self,
        results: List[Dict[str, Any]],
        object_name: str = None
    ) -> List[Dict[str, Any]]:
        """
        Rank a list of results by score.
        
        Args:
            results: List of search results with scores
            object_name: Optional object name for priority adjustment
            
        Returns:
            Sorted list of results
        """
        # Apply object priority if available
        object_priority = 1.0
        if object_name and object_name.lower() in self.object_priorities:
            # Higher priority objects get a boost (lower priority number = higher boost)
            priority = self.object_priorities[object_name.lower()]
            object_priority = 1.0 + (10 - min(priority, 10)) / 10  # 1.0 to 2.0 range
        
        for result in results:
            result["_adjusted_score"] = result.get("score", 0) * object_priority
        
        # Sort by adjusted score descending
        results.sort(key=lambda r: r.get("_adjusted_score", 0), reverse=True)
        
        # Clean up internal field
        for result in results:
            result.pop("_adjusted_score", None)
        
        return results
    
    def get_highlight_positions(self, query: str, text: str) -> List[Tuple[int, int]]:
        """
        Get positions of query matches in text for highlighting.
        
        Returns: List of (start, end) positions
        """
        if not query or not text:
            return []
        
        positions = []
        query_lower = query.lower()
        text_lower = text.lower()
        
        # Find all occurrences
        start = 0
        while True:
            pos = text_lower.find(query_lower, start)
            if pos == -1:
                break
            positions.append((pos, pos + len(query)))
            start = pos + 1
        
        # Also find token matches
        for token in query.lower().split():
            start = 0
            while True:
                pos = text_lower.find(token, start)
                if pos == -1:
                    break
                positions.append((pos, pos + len(token)))
                start = pos + 1
        
        # Merge overlapping positions
        if positions:
            positions.sort()
            merged = [positions[0]]
            for start, end in positions[1:]:
                if start <= merged[-1][1]:
                    merged[-1] = (merged[-1][0], max(merged[-1][1], end))
                else:
                    merged.append((start, end))
            return merged
        
        return positions

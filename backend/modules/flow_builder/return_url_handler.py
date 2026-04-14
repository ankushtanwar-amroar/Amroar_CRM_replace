"""
Screen Flow Return URL Handler
Evaluates and validates return URLs for screen redirects
Matches Salesforce Screen Flow behavior
"""
import re
from typing import Optional, Dict, Any, Tuple
from urllib.parse import urlparse


class ReturnURLHandler:
    """
    Handles Return URL evaluation and validation for Screen elements
    Salesforce Rule: Return URL causes redirect and terminates flow
    """
    
    # Unsafe URL schemes that are blocked
    UNSAFE_SCHEMES = {'javascript', 'data', 'vbscript', 'file'}
    
    # Allowed schemes (empty string for relative URLs)
    ALLOWED_SCHEMES = {'http', 'https', '', 'lightning', 'mailto', 'tel'}
    
    @classmethod
    def evaluate_return_url(cls, return_url: Optional[str], context: Dict[str, Any]) -> Optional[str]:
        """
        Evaluate return URL expression with variable substitution
        
        Args:
            return_url: Return URL string (may contain variables)
            context: Execution context with variables
            
        Returns:
            Evaluated URL string or None if empty
            
        Salesforce Rule:
            - Empty/None return URL = continue flow normally
            - Populated return URL = redirect and terminate flow
        """
        if not return_url or not return_url.strip():
            return None
        
        # Resolve variables in the URL
        evaluated_url = cls._resolve_variables(return_url, context)
        
        return evaluated_url.strip() if evaluated_url else None
    
    @classmethod
    def _resolve_variables(cls, url_template: str, context: Dict[str, Any]) -> str:
        """
        Resolve variables in URL template
        Supports both {!Variable} and {{Variable}} syntax
        
        Salesforce Rule:
            - If variable exists: Replace with value
            - If variable doesn't exist: Keep placeholder (for validation)
        
        Args:
            url_template: URL with variable placeholders
            context: Execution context with variables
            
        Returns:
            URL with variables replaced (or placeholders kept if not found)
        """
        result = url_template
        
        # Pattern 1: {!Variable.Field} or {!Variable}
        pattern1 = r'\{!([^}]+)\}'
        matches1 = re.findall(pattern1, result)
        for var_path in matches1:
            value = cls._get_variable_value(var_path, context)
            # Keep placeholder if variable not found (for error detection)
            if value is not None:
                result = result.replace(f'{{!{var_path}}}', str(value))
        
        # Pattern 2: {{Variable.Field}} or {{Variable}}
        pattern2 = r'\{\{([^}]+)\}\}'
        matches2 = re.findall(pattern2, result)
        for var_path in matches2:
            value = cls._get_variable_value(var_path, context)
            # Keep placeholder if variable not found (for error detection)
            if value is not None:
                result = result.replace(f'{{{{{var_path}}}}}', str(value))
        
        return result
    
    @classmethod
    def _get_variable_value(cls, var_path: str, context: Dict[str, Any]) -> Any:
        """
        Get variable value from context by path
        Supports nested paths like 'NewRecord.Id' or 'Screen.email'
        
        Args:
            var_path: Variable path (e.g., 'NewRecord.Id')
            context: Execution context
            
        Returns:
            Variable value or None if not found
        """
        parts = var_path.strip().split('.')
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None
            
            if value is None:
                return None
        
        return value
    
    @classmethod
    def validate_url(cls, url: str) -> Tuple[bool, Optional[str]]:
        """
        Validate URL for security and correctness
        
        Args:
            url: URL to validate
            
        Returns:
            Tuple of (is_valid, error_message)
            
        Security Rules:
            - Block javascript:, data:, vbscript:, file: schemes
            - Allow http:, https:, relative URLs
            - Allow lightning: for Salesforce navigation
            - Allow mailto:, tel: for common actions
        """
        if not url or not url.strip():
            return (False, "Return URL is empty")
        
        url = url.strip()
        
        # Check for obviously malformed URLs
        if len(url) < 1:
            return (False, "Return URL is too short")
        
        # Parse URL
        try:
            parsed = urlparse(url)
        except Exception as e:
            return (False, f"Invalid URL format: {str(e)}")
        
        # Check scheme (if present)
        scheme = parsed.scheme.lower() if parsed.scheme else ''
        
        # Block unsafe schemes
        if scheme in cls.UNSAFE_SCHEMES:
            return (False, f"Unsafe URL scheme: {scheme}:")
        
        # Check if scheme is allowed (if present)
        if scheme and scheme not in cls.ALLOWED_SCHEMES:
            return (False, f"Unsupported URL scheme: {scheme}:")
        
        # Additional security checks
        # Block URLs that look like they're trying to execute code
        dangerous_patterns = [
            r'<script',
            r'javascript:',
            r'onerror=',
            r'onload=',
            r'eval\(',
        ]
        
        url_lower = url.lower()
        for pattern in dangerous_patterns:
            if re.search(pattern, url_lower):
                return (False, "Potentially unsafe URL content detected")
        
        return (True, None)
    
    @classmethod
    def should_redirect(cls, return_url: Optional[str]) -> bool:
        """
        Determine if screen should redirect instead of continuing flow
        
        Args:
            return_url: Evaluated return URL
            
        Returns:
            True if should redirect, False if should continue flow
            
        Salesforce Rule:
            - Empty/None return URL = continue flow
            - Populated return URL = redirect
        """
        return return_url is not None and len(return_url.strip()) > 0
    
    @classmethod
    def create_redirect_response(cls, url: str, screen_id: str, flow_id: str) -> Dict[str, Any]:
        """
        Create a response object for screen redirect
        
        Args:
            url: Validated return URL
            screen_id: Screen element ID
            flow_id: Flow ID
            
        Returns:
            Response dict with redirect information
        """
        return {
            'action': 'redirect',
            'redirect_url': url,
            'screen_id': screen_id,
            'flow_id': flow_id,
            'terminate_flow': True,
            'message': 'Redirecting user as configured in Return URL'
        }


def evaluate_screen_return_url(
    screen_config: Dict[str, Any],
    context: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Main entry point for evaluating screen return URL
    
    Args:
        screen_config: Screen element configuration
        context: Flow execution context
        
    Returns:
        Redirect response dict if redirect should occur, None otherwise
        
    Usage:
        redirect_response = evaluate_screen_return_url(screen_config, context)
        if redirect_response:
            # Terminate flow and redirect user
            return redirect_response
        else:
            # Continue to next node
            continue_flow()
    
    Salesforce Rule:
        Only variables that exist in context can be resolved.
        References to non-existent variables cause runtime errors.
    """
    # Get return URL from screen config
    return_url_template = screen_config.get('return_url')
    
    if not return_url_template:
        return None
    
    # Evaluate variables in return URL
    evaluated_url = ReturnURLHandler.evaluate_return_url(return_url_template, context)
    
    if not evaluated_url:
        return None
    
    # Check for unresolved variables (Salesforce validation)
    # If URL still contains {{ or {! patterns, variables weren't resolved
    if '{{' in evaluated_url or '{!' in evaluated_url:
        # Extract unresolved variable names for error message
        import re
        unresolved = re.findall(r'\{\{([^}]+)\}\}|\{!([^}]+)\}', evaluated_url)
        var_names = [match[0] or match[1] for match in unresolved]
        
        raise ValueError(
            "Return URL contains unresolved variables: " + ", ".join(var_names) + ". "
            "Variables must exist in flow context before this screen executes."
        )
    
    # Validate URL
    is_valid, error_msg = ReturnURLHandler.validate_url(evaluated_url)
    
    if not is_valid:
        raise ValueError(error_msg)
    
    # Check if should redirect
    if ReturnURLHandler.should_redirect(evaluated_url):
        return ReturnURLHandler.create_redirect_response(
            evaluated_url,
            screen_config.get('id', 'unknown'),
            context.get('flow_id', 'unknown')
        )
    
    return None

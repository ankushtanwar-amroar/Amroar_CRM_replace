"""
Custom Condition Logic Parser
Salesforce-style custom logic evaluator for Flow Builder conditions

Supports expressions like:
- (1 AND 2) OR (3 AND 4)
- 1 AND (2 OR 3)
- (1 OR 2 OR 3) AND 4

Grammar:
- condition_number: Integer representing condition index (1-based)
- AND, OR: Logical operators
- ( ): Grouping/precedence
"""
import re
from typing import List, Dict, Any, Union
from enum import Enum


class TokenType(Enum):
    """Token types for lexer"""
    NUMBER = "NUMBER"
    AND = "AND"
    OR = "OR"
    LPAREN = "("
    RPAREN = ")"
    EOF = "EOF"


class Token:
    """Token representation"""
    def __init__(self, type: TokenType, value: Any):
        self.type = type
        self.value = value
    
    def __repr__(self):
        return f"Token({self.type}, {self.value})"


class ASTNode:
    """Abstract Syntax Tree Node"""
    pass


class ConditionNode(ASTNode):
    """Leaf node representing a condition number"""
    def __init__(self, number: int):
        self.number = number
    
    def __repr__(self):
        return f"Condition({self.number})"


class LogicalOpNode(ASTNode):
    """Binary operator node (AND/OR)"""
    def __init__(self, operator: str, left: ASTNode, right: ASTNode):
        self.operator = operator  # 'AND' or 'OR'
        self.left = left
        self.right = right
    
    def __repr__(self):
        return f"({self.left} {self.operator} {self.right})"


class ConditionLogicParser:
    """
    Parser for custom condition logic expressions
    
    Example usage:
        parser = ConditionLogicParser()
        ast = parser.parse("(1 AND 2) OR 3")
        result = parser.evaluate(ast, condition_results)
    """
    
    def __init__(self):
        self.tokens: List[Token] = []
        self.pos = 0
    
    def validate_expression(self, expression: str, num_conditions: int) -> Dict[str, Any]:
        """
        Validate a custom logic expression
        
        Returns:
            {
                "valid": bool,
                "error": str or None,
                "message": str
            }
        """
        try:
            # Lexical analysis
            self.tokens = self._tokenize(expression)
            
            # Syntax analysis
            self.pos = 0
            ast = self._parse_expression()
            
            # Check if all tokens consumed
            if self.pos < len(self.tokens) - 1:  # -1 for EOF
                return {
                    "valid": False,
                    "error": "Unexpected tokens after expression",
                    "message": f"Found extra tokens: {self.tokens[self.pos:]}"
                }
            
            # Validate condition numbers are within range
            condition_numbers = self._extract_condition_numbers(ast)
            invalid_numbers = [n for n in condition_numbers if n < 1 or n > num_conditions]
            
            if invalid_numbers:
                return {
                    "valid": False,
                    "error": "Invalid condition numbers",
                    "message": f"Condition numbers {invalid_numbers} are out of range (1-{num_conditions})"
                }
            
            # Check if all conditions are referenced (optional warning)
            all_conditions = set(range(1, num_conditions + 1))
            referenced = set(condition_numbers)
            unused = all_conditions - referenced
            
            warning = f" Note: Conditions {list(unused)} are not used in the logic." if unused else ""
            
            return {
                "valid": True,
                "error": None,
                "message": f"Expression is valid!{warning}",
                "ast": ast,
                "condition_numbers": condition_numbers
            }
            
        except Exception as e:
            return {
                "valid": False,
                "error": str(e),
                "message": f"Parse error: {str(e)}"
            }
    
    def parse(self, expression: str) -> ASTNode:
        """Parse expression and return AST"""
        self.tokens = self._tokenize(expression)
        self.pos = 0
        return self._parse_expression()
    
    def evaluate(self, ast: ASTNode, condition_results: List[bool]) -> bool:
        """
        Evaluate AST with actual condition results
        
        Args:
            ast: Abstract Syntax Tree from parse()
            condition_results: List of boolean results for each condition (0-indexed)
        
        Returns:
            Final boolean result
        """
        if isinstance(ast, ConditionNode):
            # Convert 1-based to 0-based index
            idx = ast.number - 1
            if idx < 0 or idx >= len(condition_results):
                raise ValueError(f"Condition {ast.number} out of range")
            return condition_results[idx]
        
        elif isinstance(ast, LogicalOpNode):
            left_result = self.evaluate(ast.left, condition_results)
            right_result = self.evaluate(ast.right, condition_results)
            
            if ast.operator == "AND":
                return left_result and right_result
            elif ast.operator == "OR":
                return left_result or right_result
            else:
                raise ValueError(f"Unknown operator: {ast.operator}")
        
        else:
            raise ValueError(f"Unknown AST node type: {type(ast)}")
    
    def _tokenize(self, expression: str) -> List[Token]:
        """Convert expression string to tokens"""
        tokens = []
        expression = expression.strip().upper()
        
        i = 0
        while i < len(expression):
            char = expression[i]
            
            # Skip whitespace
            if char.isspace():
                i += 1
                continue
            
            # Numbers (condition indices)
            if char.isdigit():
                num_str = ""
                while i < len(expression) and expression[i].isdigit():
                    num_str += expression[i]
                    i += 1
                tokens.append(Token(TokenType.NUMBER, int(num_str)))
                continue
            
            # AND operator
            if expression[i:i+3] == "AND":
                tokens.append(Token(TokenType.AND, "AND"))
                i += 3
                continue
            
            # OR operator
            if expression[i:i+2] == "OR":
                tokens.append(Token(TokenType.OR, "OR"))
                i += 2
                continue
            
            # Parentheses
            if char == "(":
                tokens.append(Token(TokenType.LPAREN, "("))
                i += 1
                continue
            
            if char == ")":
                tokens.append(Token(TokenType.RPAREN, ")"))
                i += 1
                continue
            
            raise ValueError(f"Unexpected character: '{char}' at position {i}")
        
        tokens.append(Token(TokenType.EOF, None))
        return tokens
    
    def _current_token(self) -> Token:
        """Get current token"""
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return Token(TokenType.EOF, None)
    
    def _consume(self, expected_type: TokenType):
        """Consume a token of expected type"""
        token = self._current_token()
        if token.type != expected_type:
            raise ValueError(f"Expected {expected_type}, got {token.type}")
        self.pos += 1
        return token
    
    def _parse_expression(self) -> ASTNode:
        """Parse: term (OR term)*"""
        left = self._parse_term()
        
        while self._current_token().type == TokenType.OR:
            self._consume(TokenType.OR)
            right = self._parse_term()
            left = LogicalOpNode("OR", left, right)
        
        return left
    
    def _parse_term(self) -> ASTNode:
        """Parse: factor (AND factor)*"""
        left = self._parse_factor()
        
        while self._current_token().type == TokenType.AND:
            self._consume(TokenType.AND)
            right = self._parse_factor()
            left = LogicalOpNode("AND", left, right)
        
        return left
    
    def _parse_factor(self) -> ASTNode:
        """Parse: NUMBER | ( expression )"""
        token = self._current_token()
        
        if token.type == TokenType.NUMBER:
            self._consume(TokenType.NUMBER)
            return ConditionNode(token.value)
        
        elif token.type == TokenType.LPAREN:
            self._consume(TokenType.LPAREN)
            expr = self._parse_expression()
            self._consume(TokenType.RPAREN)
            return expr
        
        else:
            raise ValueError(f"Unexpected token: {token}")
    
    def _extract_condition_numbers(self, ast: ASTNode) -> List[int]:
        """Extract all condition numbers from AST"""
        if isinstance(ast, ConditionNode):
            return [ast.number]
        elif isinstance(ast, LogicalOpNode):
            left_nums = self._extract_condition_numbers(ast.left)
            right_nums = self._extract_condition_numbers(ast.right)
            return left_nums + right_nums
        return []


# Example usage and tests
if __name__ == "__main__":
    parser = ConditionLogicParser()
    
    # Test cases
    test_cases = [
        ("1 AND 2", [True, True], True),
        ("1 OR 2", [False, True], True),
        ("(1 AND 2) OR 3", [True, True, False], True),
        ("(1 AND 2) OR 3", [False, False, True], True),
        ("1 AND (2 OR 3)", [True, False, True], True),
        ("(1 OR 2) AND (3 OR 4)", [False, True, True, False], True),
    ]
    
    print("Testing Custom Condition Logic Parser")
    print("=" * 60)
    
    for expression, conditions, expected in test_cases:
        try:
            ast = parser.parse(expression)
            result = parser.evaluate(ast, conditions)
            status = "✅" if result == expected else "❌"
            print(f"{status} Expression: {expression}")
            print(f"   Conditions: {conditions}")
            print(f"   Result: {result} (Expected: {expected})")
            print()
        except Exception as e:
            print(f"❌ Expression: {expression}")
            print(f"   Error: {e}")
            print()

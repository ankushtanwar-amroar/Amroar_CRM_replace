# Shared dependencies for all modules
# This file is imported by server.py after db and get_current_user are created

db = None
get_current_user = None

def init_dependencies(database, auth_function):
    """Initialize shared dependencies from server.py"""
    global db, get_current_user
    db = database
    get_current_user = auth_function


def get_db():
    """Get database instance for use in routes"""
    global db
    return db

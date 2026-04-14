"""
Service Resource Models - Work Types for Service Appointments

Note: Technician assignment models have been removed as the assign technician
feature was deprecated to follow the metadata-driven CRM architecture.
"""
from enum import Enum


class WorkType(str, Enum):
    """Work types for service appointments"""
    SERVICE = "Service"
    MAINTENANCE = "Maintenance"
    INSTALLATION = "Installation"
    EMERGENCY = "Emergency"
    SURVEY = "Survey"

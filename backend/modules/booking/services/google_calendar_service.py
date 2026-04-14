import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

class GoogleCalendarService:
    def __init__(self):
        self.client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        self.redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
        self.scopes = [
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events"
        ]

    def get_auth_url(self, state: str = "") -> str:
        from google_auth_oauthlib.flow import Flow
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.redirect_uri]
                }
            },
            scopes=self.scopes,
            redirect_uri=self.redirect_uri
        )
        
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            state=state,
            prompt="consent"
        )
        return auth_url

    def exchange_code(self, code: str) -> Dict[str, Any]:
        from google_auth_oauthlib.flow import Flow
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.redirect_uri]
                }
            },
            scopes=self.scopes,
            redirect_uri=self.redirect_uri
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        return {
            "refresh_token": credentials.refresh_token,
            "access_token": credentials.token,
            "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None
        }

    def get_credentials(self, refresh_token: str) -> Credentials:
        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.client_id,
            client_secret=self.client_secret,
            scopes=self.scopes
        )
        
        if not credentials.valid:
            credentials.refresh(Request())
        
        return credentials

    async def create_event(self, refresh_token: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            credentials = self.get_credentials(refresh_token)
            service = build("calendar", "v3", credentials=credentials)
            
            event = {
                "summary": event_data["summary"],
                "description": event_data.get("description", ""),
                "start": {
                    "dateTime": event_data["start_time"],
                    "timeZone": event_data.get("timezone", "UTC")
                },
                "end": {
                    "dateTime": event_data["end_time"],
                    "timeZone": event_data.get("timezone", "UTC")
                },
                "attendees": event_data.get("attendees", []),
                "conferenceData": {
                    "createRequest": {
                        "requestId": event_data.get("request_id", f"meet-{datetime.utcnow().timestamp()}"),
                        "conferenceSolutionKey": {"type": "hangoutsMeet"}
                    }
                },
                "reminders": {
                    "useDefault": False,
                    "overrides": [
                        {"method": "email", "minutes": 24 * 60},
                        {"method": "popup", "minutes": 30}
                    ]
                }
            }
            
            created_event = service.events().insert(
                calendarId="primary",
                body=event,
                conferenceDataVersion=1,
                sendUpdates="all"
            ).execute()
            
            meet_link = None
            if "conferenceData" in created_event and "entryPoints" in created_event["conferenceData"]:
                for entry in created_event["conferenceData"]["entryPoints"]:
                    if entry["entryPointType"] == "video":
                        meet_link = entry["uri"]
                        break
            
            return {
                "event_id": created_event["id"],
                "html_link": created_event.get("htmlLink"),
                "meet_link": meet_link
            }
        except HttpError as e:
            raise Exception(f"Google Calendar API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Error creating event: {str(e)}")

    async def update_event(self, refresh_token: str, event_id: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            credentials = self.get_credentials(refresh_token)
            service = build("calendar", "v3", credentials=credentials)
            
            event = service.events().get(calendarId="primary", eventId=event_id).execute()
            
            if "summary" in event_data:
                event["summary"] = event_data["summary"]
            if "description" in event_data:
                event["description"] = event_data["description"]
            if "start_time" in event_data:
                event["start"] = {
                    "dateTime": event_data["start_time"],
                    "timeZone": event_data.get("timezone", "UTC")
                }
            if "end_time" in event_data:
                event["end"] = {
                    "dateTime": event_data["end_time"],
                    "timeZone": event_data.get("timezone", "UTC")
                }
            
            updated_event = service.events().update(
                calendarId="primary",
                eventId=event_id,
                body=event,
                sendUpdates="all"
            ).execute()
            
            return {
                "event_id": updated_event["id"],
                "html_link": updated_event.get("htmlLink")
            }
        except HttpError as e:
            raise Exception(f"Google Calendar API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Error updating event: {str(e)}")

    async def delete_event(self, refresh_token: str, event_id: str) -> bool:
        try:
            credentials = self.get_credentials(refresh_token)
            service = build("calendar", "v3", credentials=credentials)
            
            service.events().delete(
                calendarId="primary",
                eventId=event_id,
                sendUpdates="all"
            ).execute()
            
            return True
        except HttpError as e:
            raise Exception(f"Google Calendar API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Error deleting event: {str(e)}")

    async def get_events(self, refresh_token: str, start_date: datetime, end_date: datetime) -> list:
        try:
            credentials = self.get_credentials(refresh_token)
            service = build("calendar", "v3", credentials=credentials)
            
            events_result = service.events().list(
                calendarId="primary",
                timeMin=start_date.isoformat() + "Z",
                timeMax=end_date.isoformat() + "Z",
                singleEvents=True,
                orderBy="startTime"
            ).execute()
            
            return events_result.get("items", [])
        except HttpError as e:
            raise Exception(f"Google Calendar API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Error fetching events: {str(e)}")

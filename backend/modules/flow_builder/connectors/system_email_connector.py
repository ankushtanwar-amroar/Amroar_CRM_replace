"""
System Email Connector - Enhanced
Sends emails using SMTP (system email service)
Supports:
- Multi-source FROM (custom, system user, record field)
- Multi-recipient TO (custom, system user, record field)
- Variable substitution in subject/body
- HTML body support
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import re
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# System email configuration
SYSTEM_EMAIL = os.environ.get("SYSTEM_EMAIL", "ankush.t@amroar.com")
SYSTEM_EMAIL_PASSWORD = os.environ.get("SYSTEM_EMAIL_PASSWORD", "jxsa jzwk ocbw ewqk")
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))


async def send_email_via_system(config: dict, context: dict, db=None) -> dict:
    """
    Send email using system SMTP service with enhanced configuration
    
    Args:
        config: Email configuration with enhanced fields
        context: Flow execution context for variable substitution
        db: Database connection for cross-object field resolution (optional)
        
    Returns:
        dict: Execution result with resolved values
    """
    try:
        # Resolve FROM address
        from_email = await _resolve_from_address(config, context)
        if not from_email:
            from_email = SYSTEM_EMAIL
        
        # Resolve TO addresses (multi-recipient support)
        to_emails = await _resolve_recipients(config, context)
        if not to_emails:
            raise ValueError("At least one recipient email is required")
        
        # Get subject and body
        subject = config.get("subject", "Notification")
        body = config.get("body", "")
        
        logger.info("📧 Substituting variables in email...")
        logger.info(f"   Original subject: {subject}")
        logger.info(f"   Original body: {body[:200] if body else 'empty'}...")
        logger.info(f"   DB available: {db is not None}")
        logger.info(f"   Context keys: {list(context.keys())}")
        
        # Substitute variables in subject and body
        # Use async version if db is available for cross-object resolution
        if db is not None:
            subject = await _substitute_variables_async(subject, context, db)
            body = await _substitute_variables_async(body, context, db)
            logger.info(f"   Resolved subject: {subject}")
            logger.info(f"   Resolved body: {body[:200] if body else 'empty'}...")
        else:
            subject = _substitute_variables(subject, context)
            body = _substitute_variables(body, context)
        
        # Create message
        message = MIMEMultipart()
        message['From'] = from_email
        message['To'] = ', '.join(to_emails)
        message['Subject'] = subject
        
        # Attach body as HTML
        message.attach(MIMEText(body, 'html'))
        
        # Connect to SMTP server and send
        logger.info(f"Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT}")
        logger.info(f"Sending email from {from_email} to {to_emails}")
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SYSTEM_EMAIL, SYSTEM_EMAIL_PASSWORD)
            server.send_message(message)
        
        logger.info(f"System email sent successfully to {to_emails}")
        
        return {
            "status": "success",
            "message": "Email sent via system service",
            "from": from_email,
            "recipients": to_emails,
            "recipient_count": len(to_emails),
            "subject": subject,
            "body_preview": body[:200] if body else "",
            "service": "system",
            "sent_at": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error sending system email: {e}")
        return {
            "status": "error",
            "message": str(e),
            "service": "system"
        }


async def _resolve_from_address(config: dict, context: dict) -> Optional[str]:
    """
    Resolve the FROM email address based on config mode
    
    Modes:
    - custom: Direct email in from_email
    - user: System user ID in from_user_id
    - field: Record field reference in from_field
    """
    from_mode = config.get("from_mode", "custom")
    
    if from_mode == "custom":
        email = config.get("from_email")
        if email:
            return _substitute_variables(email, context)
        return None
        
    elif from_mode == "user":
        user_id = config.get("from_user_id")
        if user_id:
            # Fetch user email from database
            try:
                from database import db
                user = await db.users.find_one({"id": user_id}, {"email": 1})
                if user:
                    return user.get("email")
            except Exception as e:
                logger.warning(f"Could not fetch user email for {user_id}: {e}")
        return None
        
    elif from_mode == "field":
        field_path = config.get("from_field")
        if field_path:
            return _resolve_field_value(field_path, context)
        return None
    
    return None


async def _resolve_recipients(config: dict, context: dict) -> List[str]:
    """
    Resolve all recipient email addresses
    
    Supports multiple recipients from different sources:
    - custom: Direct email
    - user: System user
    - field: Record field (e.g., Trigger.Contact.Email)
    """
    recipients = []
    
    logger.info("📧 Resolving email recipients...")
    
    # New multi-recipient format
    recipient_configs = config.get("recipients", [])
    if recipient_configs:
        logger.info(f"   Found {len(recipient_configs)} recipient config(s)")
        for idx, recipient in enumerate(recipient_configs):
            rtype = recipient.get("type", "custom")
            logger.info(f"   [{idx}] Type: {rtype}")
            
            if rtype == "custom" or rtype == "static":
                email = recipient.get("email")
                if email:
                    resolved = _substitute_variables(email, context)
                    logger.info(f"       Custom/Static email: {resolved}")
                    if _is_valid_email(resolved):
                        recipients.append(resolved)
                        
            elif rtype == "user":
                user_id = recipient.get("user_id")
                email = recipient.get("email")  # Pre-resolved email
                if email and _is_valid_email(email):
                    logger.info(f"       User email (pre-resolved): {email}")
                    recipients.append(email)
                elif user_id:
                    try:
                        from database import db
                        user = await db.users.find_one({"id": user_id}, {"email": 1})
                        if user and user.get("email"):
                            logger.info(f"       User email (from DB): {user.get('email')}")
                            recipients.append(user.get("email"))
                    except Exception as e:
                        logger.warning(f"Could not fetch user email for {user_id}: {e}")
                        
            elif rtype == "field":
                field_path = recipient.get("field")
                logger.info(f"       Field path: {field_path}")
                if field_path:
                    email = _resolve_field_value(field_path, context)
                    logger.info(f"       Resolved field value: {email}")
                    if email and _is_valid_email(email):
                        recipients.append(email)
                    else:
                        logger.warning(f"       ⚠️ Invalid or missing email from field: {field_path}")
    
    # Fallback to legacy single recipient format
    if not recipients:
        to_email = config.get("to") or config.get("to_email")
        if to_email:
            resolved = _substitute_variables(to_email, context)
            logger.info(f"   Legacy recipient format: {resolved}")
            if _is_valid_email(resolved):
                recipients.append(resolved)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_recipients = []
    for r in recipients:
        if r not in seen:
            seen.add(r)
            unique_recipients.append(r)
    
    logger.info(f"   ✅ Final recipients: {unique_recipients}")
    return unique_recipients


def _resolve_field_value(field_path: str, context: dict) -> Optional[str]:
    """
    Resolve a field value from context using dot notation path
    
    Examples:
    - Trigger.Contact.Email → context['Trigger']['Contact']['Email']
    - Trigger.Email → context['Trigger']['<entity>']['Email'] (shorthand)
    - Screen.email
    - node_1.records[0].Email
    - CreateContact.Email → context['CreateContact']['Email'] (B5: action output reference)
    """
    if not field_path:
        return None
    
    logger.debug(f"📧 Resolving field path: {field_path}")
    
    # First try variable substitution format
    if field_path.startswith("{{") and field_path.endswith("}}"):
        var_name = field_path[2:-2]
        
        # B5 FIX: Handle dotted paths inside {{}} for action outputs
        if '.' in var_name:
            parts = var_name.split('.')
            base_var = parts[0]
            
            # Try exact match
            value = context.get(base_var)
            
            # Try no-spaces variant (for "Create Contact" -> "CreateContact")
            if value is None:
                base_var_no_spaces = base_var.replace(" ", "")
                value = context.get(base_var_no_spaces)
            
            # Try case-insensitive match
            if value is None:
                base_lower = base_var.lower().replace(" ", "")
                for key in context.keys():
                    if key.lower().replace(" ", "") == base_lower:
                        value = context.get(key)
                        break
            
            # Navigate through properties
            if value is not None:
                for prop in parts[1:]:
                    if isinstance(value, dict):
                        # Try exact, then case-insensitive
                        if prop in value:
                            value = value.get(prop)
                        else:
                            prop_lower = prop.lower()
                            found = False
                            for k in value.keys():
                                if k.lower() == prop_lower:
                                    value = value.get(k)
                                    found = True
                                    break
                            if not found:
                                value = None
                                break
                    else:
                        value = None
                        break
                
                if value is not None:
                    logger.debug(f"   Dotted variable resolved: {value}")
                    return str(value)
        
        result = str(context.get(var_name, ""))
        logger.debug(f"   Variable format resolved: {result}")
        return result
    
    # Split path and traverse context
    parts = field_path.replace("{{", "").replace("}}", "").split(".")
    
    # FIX #4: Handle shorthand Trigger.Email -> Trigger.<Entity>.Email
    if len(parts) == 2 and parts[0] == "Trigger":
        trigger_ctx = context.get("Trigger", {})
        if isinstance(trigger_ctx, dict):
            # Find the entity key (e.g., "Contact", "Lead", "Account")
            for key in trigger_ctx.keys():
                if key != "Id" and isinstance(trigger_ctx.get(key), dict):
                    # Try to get the field from this entity
                    entity_data = trigger_ctx[key]
                    field_name = parts[1]
                    if field_name in entity_data:
                        result = str(entity_data[field_name])
                        logger.debug(f"   Shorthand Trigger.{field_name} resolved via {key}: {result}")
                        return result
    
    # B5 FIX: Handle action output references (e.g., CreateContact.Email)
    if len(parts) >= 2:
        base_var = parts[0]
        base_var_no_spaces = base_var.replace(" ", "")
        
        # Try exact match first
        value = context.get(base_var)
        
        # Try no-spaces variant
        if value is None:
            value = context.get(base_var_no_spaces)
        
        # Try case-insensitive
        if value is None:
            base_lower = base_var.lower().replace(" ", "")
            for key in context.keys():
                if key.lower().replace(" ", "") == base_lower:
                    value = context.get(key)
                    break
        
        if value is not None and isinstance(value, dict):
            # Navigate through remaining parts
            for part in parts[1:]:
                if isinstance(value, dict):
                    if part in value:
                        value = value.get(part)
                    else:
                        part_lower = part.lower()
                        found = False
                        for k in value.keys():
                            if k.lower() == part_lower:
                                value = value.get(k)
                                found = True
                                break
                        if not found:
                            value = None
                            break
                else:
                    value = None
                    break
            
            if value is not None:
                result = str(value)
                logger.debug(f"   Action output resolved: {result}")
                return result
    
    value = context
    for part in parts:
        if value is None:
            return None
            
        # Handle array indexing like records[0]
        if "[" in part and "]" in part:
            array_part = part[:part.index("[")]
            index = int(part[part.index("[")+1:part.index("]")])
            
            if isinstance(value, dict):
                value = value.get(array_part, [])
            
            if isinstance(value, list) and len(value) > index:
                value = value[index]
            else:
                return None
        else:
            if isinstance(value, dict):
                # Try exact match first
                if part in value:
                    value = value.get(part)
                else:
                    # Try case-insensitive match
                    lower_part = part.lower()
                    matched = False
                    for key in value.keys():
                        if key.lower() == lower_part:
                            value = value.get(key)
                            matched = True
                            break
                    if not matched:
                        return None
            else:
                return None
    
    result = str(value) if value else None
    logger.debug(f"   Final resolved value: {result}")
    return result


def _substitute_variables(text: str, context: dict, db=None) -> str:
    """
    Substitute {{variable}} placeholders with actual values from context
    
    Supports:
    - Simple variables: {{contact_name}}
    - Nested paths: {{Trigger.Contact.Name}}
    - Cross-object merge fields: {{Account.Name}} (resolves via AccountId reference)
    - System variables: {{System.CurrentDate}}
    """
    if not text:
        return text
    
    # Find all {{variable}} patterns (including dots for nested paths)
    pattern = r'\{\{([\w.]+)\}\}'
    
    def replace_match(match):
        var_path = match.group(1)
        
        # Handle system variables
        if var_path.startswith("System."):
            system_var = var_path[7:]
            if system_var == "CurrentDate":
                return datetime.now(timezone.utc).strftime("%Y-%m-%d")
            elif system_var == "CurrentTime":
                return datetime.now(timezone.utc).strftime("%H:%M:%S")
            elif system_var == "CurrentUser":
                return context.get("current_user", "System")
            return match.group(0)
        
        # Try direct lookup first
        if var_path in context:
            return str(context[var_path])
        
        # Try nested path resolution
        resolved = _resolve_field_value(var_path, context)
        if resolved:
            return resolved
        
        # Return original if not found
        return match.group(0)
    
    return re.sub(pattern, replace_match, text)


async def _substitute_variables_async(text: str, context: dict, db=None) -> str:
    """
    Async version of variable substitution that supports:
    - Cross-object merge fields ({{Account.Name}})
    - Collection helpers: {{count()}}, {{join()}}, {{#each}}...{{/each}}
    - Simple variables: {{variable}}
    - Nested paths: {{GetRecords.records}}
    """
    if not text:
        return text
    
    # First process collection helpers (count, join, each)
    text = _process_collection_helpers(text, context)
    
    # Find all {{variable}} patterns (including dots for nested paths)
    pattern = r'\{\{([\w.]+)\}\}'
    
    # Collect all matches and their replacements
    replacements = {}
    
    for match in re.finditer(pattern, text):
        var_path = match.group(1)
        original = match.group(0)
        
        # Handle system variables
        if var_path.startswith("System."):
            system_var = var_path[7:]
            if system_var == "CurrentDate":
                replacements[original] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            elif system_var == "CurrentTime":
                replacements[original] = datetime.now(timezone.utc).strftime("%H:%M:%S")
            elif system_var == "CurrentUser":
                replacements[original] = context.get("current_user", "System")
            continue
        
        # Try direct lookup first
        if var_path in context:
            value = context[var_path]
            # Handle lists/dicts gracefully
            if isinstance(value, list):
                replacements[original] = str(len(value)) + " items" if value else "0 items"
            elif isinstance(value, dict):
                replacements[original] = str(value)
            else:
                replacements[original] = str(value)
            continue
        
        # Try nested path resolution for simple paths
        resolved = _resolve_field_value(var_path, context)
        if resolved and resolved != original and not resolved.startswith("{{"):
            replacements[original] = resolved
            continue
        
        # Try cross-object merge field resolution
        if db is not None and '.' in var_path:
            parts = var_path.split('.')
            related_objects = {'Account', 'Owner', 'Contact', 'Lead', 'User', 'Campaign', 'Opportunity', 'Parent', 'Manager', 'CreatedBy', 'ModifiedBy'}
            
            is_cross_object = False
            for part in parts[:-1]:
                if part in related_objects:
                    is_cross_object = True
                    break
            
            if is_cross_object:
                cross_obj_resolved = await _resolve_cross_object_field(var_path, context, db)
                if cross_obj_resolved:
                    replacements[original] = cross_obj_resolved
                    continue
    
    # Apply all replacements
    result = text
    for original, replacement in replacements.items():
        result = result.replace(original, replacement)
    
    return result


def _process_collection_helpers(text: str, context: dict) -> str:
    """
    Process collection helper functions in email templates:
    - {{count(path)}} - returns count of items in collection
    - {{join(path.field, separator)}} - joins field values with separator
    - {{#each path}}...{{/each}} - iterates over collection
    """
    if not text:
        return text
    
    # 1. Process {{count(path)}} - e.g., {{count(GetOpps.records)}}
    count_pattern = r'\{\{count\(([^)]+)\)\}\}'
    def replace_count(match):
        path = match.group(1).strip()
        collection = _get_collection_from_path(path, context)
        if collection is not None:
            if isinstance(collection, list):
                return str(len(collection))
            elif isinstance(collection, (int, float)):
                return str(int(collection))
        return "0"
    text = re.sub(count_pattern, replace_count, text)
    
    # 2. Process {{join(path.field, separator)}} - e.g., {{join(GetOpps.records.Name, ", ")}}
    join_pattern = r'\{\{join\(([^,]+),\s*["\']([^"\']+)["\']\)\}\}'
    def replace_join(match):
        path = match.group(1).strip()
        separator = match.group(2)
        
        # Parse the path: GetOpps.records.Name -> collection=GetOpps.records, field=Name
        parts = path.split('.')
        if len(parts) >= 2:
            # Try to find collection and field
            field_name = parts[-1]
            collection_path = '.'.join(parts[:-1])
            collection = _get_collection_from_path(collection_path, context)
            
            if collection and isinstance(collection, list):
                values = []
                for item in collection:
                    if isinstance(item, dict):
                        val = item.get(field_name) or item.get(field_name.lower())
                        if val:
                            values.append(str(val))
                return separator.join(values)
        return ""
    text = re.sub(join_pattern, replace_join, text)
    
    # 3. Process {{#each path}}...{{/each}} - e.g., {{#each GetOpps.records}}{{Name}} - {{Amount}}{{/each}}
    each_pattern = r'\{\{#each\s+([^}]+)\}\}(.*?)\{\{/each\}\}'
    def replace_each(match):
        path = match.group(1).strip()
        template = match.group(2)
        collection = _get_collection_from_path(path, context)
        
        if collection and isinstance(collection, list):
            results = []
            for idx, item in enumerate(collection):
                item_result = template
                # Replace {{field}} with item.field
                field_pattern = r'\{\{(\w+)\}\}'
                def replace_item_field(field_match):
                    field_name = field_match.group(1)
                    if isinstance(item, dict):
                        val = item.get(field_name) or item.get(field_name.lower())
                        if val is not None:
                            return str(val)
                    return field_match.group(0)
                item_result = re.sub(field_pattern, replace_item_field, item_result)
                # Also replace {{@index}} with current index
                item_result = item_result.replace('{{@index}}', str(idx))
                item_result = item_result.replace('{{@first}}', 'true' if idx == 0 else 'false')
                item_result = item_result.replace('{{@last}}', 'true' if idx == len(collection) - 1 else 'false')
                results.append(item_result)
            return ''.join(results)
        return ""
    text = re.sub(each_pattern, replace_each, text, flags=re.DOTALL)
    
    return text


def _get_collection_from_path(path: str, context: dict):
    """
    Resolve a path to get a collection from context.
    Supports: GetOpps.records, GetOpps.count, NodeName.records
    """
    parts = path.split('.')
    value = context
    
    for part in parts:
        if value is None:
            return None
        
        if isinstance(value, dict):
            # Try exact match
            if part in value:
                value = value[part]
            else:
                # Try case-insensitive and no-spaces variants
                found = False
                part_lower = part.lower().replace(" ", "").replace("_", "")
                for key in value.keys():
                    key_lower = key.lower().replace(" ", "").replace("_", "")
                    if key_lower == part_lower:
                        value = value[key]
                        found = True
                        break
                if not found:
                    return None
        elif isinstance(value, list):
            # Handle array indexing like [0]
            if part.isdigit():
                idx = int(part)
                if idx < len(value):
                    value = value[idx]
                else:
                    return None
            else:
                return None
        else:
            return None
    
    return value


async def _resolve_cross_object_field(var_path: str, context: dict, db) -> Optional[str]:
    """
    Resolve cross-object merge fields like {{Account.Name}} or {{Trigger.Contact.Account.Name}}
    
    This works by:
    1. Parsing the path to get the related object name and field
    2. Finding the reference field in the trigger record (AccountId or account_id)
    3. Looking up the related record by ID
    4. Returning the requested field value
    
    Supports:
    - {{Account.Name}} -> looks for AccountId/account_id in trigger data
    - {{Trigger.Contact.Account.Name}} -> same, traverses through Trigger.Contact first
    - {{Owner.Name}} -> looks for OwnerId/owner_id
    """
    if db is None:
        logger.warning("Database not available for cross-object field resolution")
        return None
    
    parts = var_path.split('.')
    if len(parts) < 2:
        return None
    
    logger.info(f"🔗 Resolving cross-object field: {var_path}")
    logger.info(f"   Parts: {parts}")
    
    # Handle different path formats:
    # Format 1: Account.Name (2 parts) - related_object is first part
    # Format 2: Trigger.Contact.Account.Name (4 parts) - related_object is 3rd part
    # Format 3: Contact.Account.Name (3 parts) - related_object is 2nd part
    
    related_object = None
    related_field = None
    trigger_entity_data = None
    trigger_entity_name = None
    
    # Get the trigger context
    trigger_ctx = context.get("Trigger", {})
    
    if parts[0] == "Trigger" and len(parts) >= 4:
        # Format: Trigger.Contact.Account.Name
        trigger_entity_name = parts[1]  # "Contact"
        related_object = parts[2]       # "Account"
        related_field = parts[3]        # "Name"
        
        # Get the trigger entity data
        if isinstance(trigger_ctx, dict):
            trigger_entity_data = trigger_ctx.get(trigger_entity_name, {})
            
    elif parts[0] == "Trigger" and len(parts) == 3:
        # Format: Trigger.Account.Name - but Account is the related object
        # This is actually a shorthand - find the trigger entity first
        related_object = parts[1]       # "Account"
        related_field = parts[2]        # "Name"
        
        # Get the trigger entity data from first entity in context
        if isinstance(trigger_ctx, dict):
            for key, value in trigger_ctx.items():
                if key != "Id" and isinstance(value, dict):
                    trigger_entity_data = value
                    trigger_entity_name = key
                    break
                    
    elif len(parts) == 3:
        # Format: Contact.Account.Name
        trigger_entity_name = parts[0]  # "Contact"
        related_object = parts[1]       # "Account"
        related_field = parts[2]        # "Name"
        
        # Try to get from Trigger context or direct context
        if isinstance(trigger_ctx, dict) and trigger_entity_name in trigger_ctx:
            trigger_entity_data = trigger_ctx.get(trigger_entity_name, {})
        else:
            trigger_entity_data = context.get(trigger_entity_name, {})
            
    elif len(parts) == 2:
        # Format: Account.Name - simplest case
        related_object = parts[0]       # "Account"
        related_field = parts[1]        # "Name"
        
        # Find the trigger entity data
        if isinstance(trigger_ctx, dict):
            for key, value in trigger_ctx.items():
                if key != "Id" and isinstance(value, dict):
                    trigger_entity_data = value
                    trigger_entity_name = key
                    break
    else:
        logger.warning(f"   Unsupported path format with {len(parts)} parts")
        return None
    
    if not related_object or not related_field:
        logger.warning("   Could not parse related object/field from path")
        return None
    
    logger.info(f"   Related object: {related_object}")
    logger.info(f"   Related field: {related_field}")
    logger.info(f"   Trigger entity: {trigger_entity_name}")
    
    # If we don't have trigger entity data yet, try to get it from flat context
    if not trigger_entity_data:
        trigger_entity_data = {k: v for k, v in context.items() 
                              if not k.startswith('_') and k not in ['Trigger', 'trigger_type', 'entity', 'tenant_id']}
        trigger_entity_name = context.get('entity', 'Unknown')
    
    logger.info(f"   Available fields in trigger data: {list(trigger_entity_data.keys()) if trigger_entity_data else []}")
    
    # Look for the reference field to the related object
    # Try multiple naming conventions: AccountId, account_id, accountId
    related_object_lower = related_object.lower()
    reference_field_candidates = [
        f"{related_object}Id",           # AccountId
        f"{related_object_lower}_id",    # account_id
        f"{related_object_lower}Id",     # accountId
        f"{related_object_lower}id",     # accountid
        f"{related_object}_id",          # Account_id
    ]
    
    related_record_id = None
    for ref_field in reference_field_candidates:
        # Check in trigger entity data
        if trigger_entity_data:
            related_record_id = trigger_entity_data.get(ref_field)
            if related_record_id:
                logger.info(f"   Found reference via {ref_field}: {related_record_id}")
                break
        
        # Also check flat context
        if not related_record_id:
            related_record_id = context.get(ref_field)
            if related_record_id:
                logger.info(f"   Found reference in context via {ref_field}: {related_record_id}")
                break
    
    if not related_record_id:
        logger.warning(f"   No reference field found for {related_object}. Tried: {reference_field_candidates}")
        return None
    
    # Fetch the related record from the database
    try:
        # Get tenant_id from context
        tenant_id = context.get('tenant_id') or trigger_entity_data.get('tenant_id')
        if not tenant_id:
            # Try to get from execution context
            for key in ['_tenant_id', 'tenantId']:
                tenant_id = context.get(key)
                if tenant_id:
                    break
        
        logger.info(f"   Fetching {related_object_lower} record: {related_record_id}")
        
        # Query for the related record
        query = {"id": related_record_id}
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        related_record = await db.object_records.find_one(query)
        
        if not related_record:
            logger.warning(f"   Related {related_object} record not found: {related_record_id}")
            return None
        
        # Get the requested field from the related record's data
        related_data = related_record.get("data", {})
        
        # Try multiple field name variants
        field_candidates = [
            related_field,              # Name
            related_field.lower(),      # name
            related_field.replace('_', ''),  # accountname -> accountname
        ]
        
        # For "Name" field, also try object-specific variants
        if related_field.lower() == "name":
            field_candidates.extend([
                f"{related_object_lower}_name",  # account_name
                "account_name",                   # common convention
                "company_name",
            ])
        
        for field_variant in field_candidates:
            value = related_data.get(field_variant)
            if value:
                logger.info(f"   ✅ Resolved {related_object}.{related_field} = {value}")
                return str(value)
        
        logger.warning(f"   Field '{related_field}' not found in {related_object} record. Available: {list(related_data.keys())}")
        return None
        
    except Exception as e:
        logger.error(f"   Error resolving cross-object field: {e}")
        return None


def _is_valid_email(email: str) -> bool:
    """Validate email format"""
    if not email:
        return False
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return bool(re.match(pattern, email))

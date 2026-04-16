# Test Credentials

## Super Admin (Admin Panel)
- Email: superadmin@example.com
- Password: admin123
- Access: /admin/login → /admin/tenants, /admin/modules, /admin/tenants/create

## New DocFlow-Only Tenant (Created via Admin Panel)
- Email: docflow@test.com
- Password: DocFlow123!
- Tenant: DocFlow Test Org
- Enabled Modules: DocFlow, Connections ONLY
- Landing Page: /setup

## Demo DocFlow-Only Tenant (Created via Admin API)
- Email: admin@democorp.com
- Password: DemoPass123!
- Tenant: Demo Corp
- Enabled Modules: DocFlow, Connections ONLY
- Landing Page: /setup

## Old DocFlow-Only Tenant (Broad - Many modules enabled, CRM disabled)
- Email: test@gmail.com
- Password: test123
- Tenant: Amroar technology
- Enabled Modules: Most modules except CRM/Sales Console
- Landing Page: /setup

## CRM Tenant (Full CRM Access)
- Email: testuser@emergent.com
- Password: Test123!
- Tenant: DanSoft
- Plan: Enterprise
- Landing Page: /crm-platform

## CRM Tenant (Shivam - Full Access)
- Email: keppouttitteya-1869@yopmail.com
- Password: test123
- Landing Page: /crm-platform

## Third-Party Integrations
- OpenAI: Uses Emergent LLM Key
- Stripe: Requires User API Key
- Salesforce: Requires User API Key & Custom Domain
- SMTP: Pre-configured in backend .env (SendGrid SMTP relay)

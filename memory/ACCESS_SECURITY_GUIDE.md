# CRM Access & Security Module - Overview & Testing Guide

## Part 1: How It Works (Simple Explanation)

### 🔐 Access Control Flow (Who Sees What?)

```
User logs in → Check Role → Check Permissions → Check Record Ownership → Apply Sharing Rules → Show Records
```

---

### 📋 Component Overview

#### 1. **Users**
- Individual people who use the CRM
- Each user has: Email, Name, Role, License
- Users own records they create

#### 2. **Roles & Hierarchy**
- Roles define a user's position in the organization
- Hierarchy = org chart (who reports to whom)
- **Key Rule:** Managers can see records owned by their team members

```
Example Hierarchy:
    CEO
     ↓
  VP Sales
     ↓
Sales Manager
     ↓
Sales Representative
```

#### 3. **Permission Bundles**
- Define what actions a user can perform on each object
- Permissions include:
  - **Read** - View records
  - **Create** - Make new records
  - **Edit** - Modify existing records
  - **Delete** - Remove records
  - **View All** - See all records (bypass ownership)
  - **Modify All** - Edit all records (bypass ownership)

#### 4. **Public Groups**
- Collections of users, roles, or other groups
- Used for sharing records with multiple people at once
- Example: "Sales Team APAC" group contains all APAC sales reps

#### 5. **Queues**
- Special containers for unassigned records
- Multiple users can "pick" records from a queue
- Example: "New Leads Queue" - any sales rep can claim leads

#### 6. **Sharing Settings (OWD - Organization-Wide Defaults)**
- Default visibility for each object type
- Three levels:
  - **Private** - Only owner & managers see records
  - **Public Read Only** - Everyone can view
  - **Public Read/Write** - Everyone can view & edit
- **Grant Access Using Hierarchies** - Managers see subordinate records

#### 7. **Sharing Rules**
- Exceptions to OWD that grant additional access
- Two types:
  - **Criteria-based** - Share records matching conditions (e.g., Region = APAC)
  - **Owner-based** - Share records owned by specific roles/users

#### 8. **Security Center**
- Dashboard showing security overview
- Monitor: Active users, roles, sharing rules, login activity

#### 9. **Licenses & Plans**
- Control feature access based on subscription
- Example: "Standard" license = basic CRM, "Enterprise" = advanced features

---

### 🔄 How Record Visibility Works

When a user tries to view a record, the system checks (in order):

1. ✅ **Is user Super Admin?** → See everything
2. ✅ **Is user the record owner?** → Yes, can see
3. ✅ **Is owner a subordinate in hierarchy?** → Yes, can see (if hierarchy enabled)
4. ✅ **Is there a sharing rule granting access?** → Yes, can see
5. ✅ **Is user in a group that has access?** → Yes, can see
6. ✅ **Is record in a queue user belongs to?** → Yes, can see
7. ❌ **None of the above?** → Access Denied

---

## Part 2: Manual Testing Guide

### Test Users Available

| User | Email | Password | Role |
|------|-------|----------|------|
| Sales Rep | salesrep1@test.com | test123 | Sales Representative |
| Manager | salesmanager@test.com | test123 | Sales Manager |
| CEO | ceo@test.com | test123 | CEO |

---

### Test 1: Role Hierarchy Access

**Goal:** Verify managers can see their team's records

#### Step 1.1: Create a record as Sales Rep
1. Login as `salesrep1@test.com` / `test123`
2. Go to **Sales Console → Leads**
3. Click **+ New Lead**
4. Enter: First Name = "Hierarchy", Last Name = "Test", Company = "Test Corp"
5. Save the record
6. **Note the Lead ID** (e.g., LED-XXXX)
7. Logout

#### Step 1.2: Verify Manager can see the record
1. Login as `salesmanager@test.com` / `test123`
2. Go to **Sales Console → Leads**
3. **Expected:** You should see "Hierarchy Test" in the list
4. Click on the lead to open it
5. **Expected:** Record opens successfully (not "Access Denied")

#### Step 1.3: Verify CEO can see the record
1. Login as `ceo@test.com` / `test123`
2. Go to **Sales Console → Leads**
3. **Expected:** You should see "Hierarchy Test" in the list
4. **Why:** CEO is above Manager in hierarchy, so can see all subordinate records

#### Step 1.4: Verify Sales Rep cannot see Manager's records
1. Login as `salesmanager@test.com` / `test123`
2. Create a new Lead: "Manager Only Lead"
3. Note the Lead ID, Logout
4. Login as `salesrep1@test.com` / `test123`
5. Go to Leads list
6. **Expected:** You should NOT see "Manager Only Lead"
7. **Why:** Subordinates cannot see manager's records (hierarchy only goes down)

✅ **Pass Criteria:** Manager sees Sales Rep's records, Sales Rep cannot see Manager's records

---

### Test 2: User Permissions

**Goal:** Verify permission bundles control actions

#### Step 2.1: Check Read Permission
1. Login as `salesrep1@test.com` / `test123`
2. Go to **Sales Console → Leads**
3. **Expected:** Can view list of leads

#### Step 2.2: Check Create Permission
1. Click **+ New Lead**
2. **Expected:** Form opens to create new record
3. Create and save a lead
4. **Expected:** Record saves successfully

#### Step 2.3: Check Edit Permission
1. Open an existing lead you own
2. Click **Edit**
3. Change a field (e.g., update Company name)
4. Save
5. **Expected:** Changes save successfully

#### Step 2.4: Check Delete Permission (if enabled)
1. Open a lead you own
2. Look for **Delete** button
3. **Expected:** If you have delete permission, button is visible

✅ **Pass Criteria:** User can perform actions matching their permission bundle

---

### Test 3: Record Ownership & Visibility

**Goal:** Verify OWD (Organization-Wide Defaults) work correctly

#### Step 3.1: Verify Private OWD
1. Confirm Lead OWD is set to "Private" (Setup → Sharing Settings)
2. Login as `salesrep1@test.com`
3. Create a new lead: "Private Test Lead"
4. Logout
5. Login as a different user (not manager, not in same hierarchy)
6. Go to Leads
7. **Expected:** "Private Test Lead" is NOT visible
8. **Why:** Private OWD means only owner & managers see records

#### Step 3.2: Verify Owner Access
1. Login as `salesrep1@test.com`
2. Go to Leads
3. **Expected:** All leads owned by you are visible
4. **Why:** Owners always see their own records

✅ **Pass Criteria:** Private records only visible to owner and their managers

---

### Test 4: Queues (If Configured)

**Goal:** Verify queue functionality

#### Step 4.1: Check Queue Membership
1. Login as admin
2. Go to **Setup → Queues**
3. Find or create a queue (e.g., "New Leads Queue")
4. Add `salesrep1@test.com` as a member
5. Add Lead as a supported object

#### Step 4.2: Assign Record to Queue
1. Open any Lead
2. Change Owner to "New Leads Queue"
3. Save

#### Step 4.3: Verify Queue Members Can See Record
1. Login as `salesrep1@test.com` (queue member)
2. Go to Leads
3. **Expected:** Queue-owned lead is visible
4. **Why:** Queue members can see and claim queue records

✅ **Pass Criteria:** Records assigned to queues are visible to queue members

---

### Test 5: Sharing Rules

**Goal:** Verify sharing rules grant additional access

#### Step 5.1: Check Existing Sharing Rules
1. Login as admin
2. Go to **Setup → Sharing Settings → Sharing Rules**
3. Note any active rules for Lead object

#### Step 5.2: Test Criteria-Based Rule
*Example: If rule shares "Region = APAC" leads with Sales Manager role*

1. Login as `salesrep1@test.com`
2. Create a Lead with Region = "APAC"
3. Logout
4. Login as `salesmanager@test.com`
5. Go to Leads
6. **Expected:** APAC lead is visible (via sharing rule + hierarchy)

#### Step 5.3: Verify Non-Matching Records Not Shared
1. Create a Lead with Region = "EMEA" (not matching rule)
2. Logout
3. Login as a user NOT in hierarchy
4. **Expected:** EMEA lead is NOT visible (doesn't match sharing rule)

✅ **Pass Criteria:** Sharing rules grant access to matching records only

---

## Quick Reference Card

| What You Want | Where to Configure |
|---------------|-------------------|
| Add new user | Setup → Users |
| Change user's role | Setup → Users → Edit User |
| Set who sees what by default | Setup → Sharing Settings |
| Give extra access to specific records | Setup → Sharing Rules |
| Create team groups | Setup → Public Groups |
| Set up unassigned record pools | Setup → Queues |
| Control actions (create/edit/delete) | Setup → Permission Bundles |

---

## Summary for Management

✅ **Role Hierarchy** - Working correctly. Managers can see their team's records.

✅ **Private OWD** - Working correctly. Records are only visible to owners and their management chain.

✅ **Sharing Rules** - Working correctly. Additional access can be granted based on criteria.

✅ **Permission Control** - Working correctly. Users can only perform actions allowed by their permission bundle.

**Security Model Status: OPERATIONAL** ✓

---

*Document created: December 15, 2025*
*Last tested: December 15, 2025*

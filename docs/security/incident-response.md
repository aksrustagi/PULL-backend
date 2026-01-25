# PULL Backend Security Incident Response Playbook

**Version:** 1.0
**Last Updated:** 2026-01-25
**Classification:** Confidential - Internal Use Only

This playbook provides step-by-step procedures for responding to security incidents affecting the PULL platform.

---

## Table of Contents

1. [Incident Classification](#1-incident-classification)
2. [Response Team & Contacts](#2-response-team--contacts)
3. [Initial Response Procedures](#3-initial-response-procedures)
4. [Incident-Specific Playbooks](#4-incident-specific-playbooks)
5. [Communication Templates](#5-communication-templates)
6. [Post-Incident Procedures](#6-post-incident-procedures)

---

## 1. Incident Classification

### Severity Levels

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| **SEV-1 (Critical)** | Active breach, data exfiltration, service down | 15 minutes | Ransomware, active intrusion, PII breach |
| **SEV-2 (High)** | Potential breach, security control failure | 1 hour | Credential exposure, vulnerability exploitation |
| **SEV-3 (Medium)** | Security anomaly, failed attack attempt | 4 hours | Brute force attempts, suspicious activity |
| **SEV-4 (Low)** | Minor security issue, policy violation | 24 hours | Misconfiguration, audit finding |

### Incident Categories

| Category | Description | Primary Owner |
|----------|-------------|---------------|
| **Authentication/Authorization** | Unauthorized access, credential theft | Security Team |
| **Data Breach** | PII exposure, data exfiltration | Security + Legal |
| **Infrastructure** | Server compromise, DDoS attack | Platform Team |
| **Application** | Vulnerability exploitation, injection | Backend Team |
| **Insider Threat** | Malicious employee activity | Security + HR |
| **Third-Party** | Vendor breach affecting PULL | Security + Vendor |
| **Compliance** | Regulatory violation | Compliance Team |

---

## 2. Response Team & Contacts

### Incident Response Team (IRT)

| Role | Primary | Backup | Responsibility |
|------|---------|--------|----------------|
| **Incident Commander (IC)** | Security Lead | CTO | Overall coordination |
| **Technical Lead** | On-call Engineer | Backend Lead | Technical investigation |
| **Communications Lead** | Head of Marketing | CEO | External communications |
| **Legal Counsel** | General Counsel | External Counsel | Legal/regulatory guidance |
| **Compliance Officer** | Compliance Lead | Security Lead | Regulatory reporting |

### Contact Information

**On-Call Rotation (24/7)**

| Team | PagerDuty Service | Slack Channel |
|------|-------------------|---------------|
| Security | `pull-security-oncall` | #security-incidents |
| Platform | `pull-platform-oncall` | #platform-alerts |
| Backend | `pull-backend-oncall` | #backend-alerts |

**Escalation Contacts**

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | TBD | [REDACTED] | security-lead@pull.app |
| CTO | TBD | [REDACTED] | cto@pull.app |
| CEO | TBD | [REDACTED] | ceo@pull.app |
| Legal Counsel | TBD | [REDACTED] | legal@pull.app |

**External Contacts**

| Organization | Purpose | Contact |
|--------------|---------|---------|
| GCP Security | Infrastructure incidents | Google Cloud Support |
| Cloudflare | DDoS mitigation | Enterprise Support |
| FBI Cyber Division | Major breaches | ic3.gov |
| State AG Offices | Data breach notification | Per state requirements |
| Cyber Insurance | Breach coverage | [Policy Number] |

### Escalation Matrix

```
SEV-1: IC (immediate) -> CTO (15 min) -> CEO (30 min) -> Legal (1 hr)
SEV-2: IC (immediate) -> CTO (1 hr) -> CEO (4 hr if needed)
SEV-3: IC (1 hr) -> Team Lead (4 hr)
SEV-4: IC (4 hr) -> Weekly review
```

---

## 3. Initial Response Procedures

### 3.1 Incident Detection

**Automated Detection Sources:**

| Source | Alert Type | Response |
|--------|------------|----------|
| Cloud Armor WAF | Attack blocked/detected | Review in Logs Explorer |
| Sentry | Application errors | Check error details |
| Rate Limit Alerts | Threshold exceeded | Investigate source IP |
| Fraud Detection | Suspicious trading | Review transaction |
| Auth Failures | Brute force detected | Block IP, review account |
| Infrastructure | Unauthorized access | Immediate containment |

**Manual Detection:**

- User reports via support
- Security researcher disclosure
- Routine audit findings
- Third-party notifications

### 3.2 First Responder Checklist

**DO IMMEDIATELY (First 15 minutes):**

- [ ] **Verify the incident is real** (not false positive)
- [ ] **Assign severity level** using classification above
- [ ] **Create incident ticket** in incident tracking system
- [ ] **Start incident timeline** with all actions and timestamps
- [ ] **Notify Incident Commander** via PagerDuty
- [ ] **Join incident Slack channel** (#security-incidents)
- [ ] **DO NOT discuss in public channels**

**DO NOT:**

- Modify/delete evidence without documenting
- Communicate externally without approval
- Make changes without logging
- Panic or take hasty actions

### 3.3 Initial Assessment

```
INCIDENT ASSESSMENT TEMPLATE
============================
Date/Time Detected: [YYYY-MM-DD HH:MM UTC]
Detected By: [Name/System]
Initial Severity: [SEV-1/2/3/4]

WHAT:
- What happened?
- What systems are affected?
- What data may be affected?

WHO:
- Who detected it?
- Who else is aware?
- Who might be responsible?

IMPACT:
- Users affected: [Number/Scope]
- Data affected: [Type/Volume]
- Business impact: [Revenue/Reputation]

CONTAINMENT NEEDED:
- [ ] Immediate action required
- [ ] Can wait for team assembly
```

### 3.4 Containment Actions

**Network Level:**

```bash
# Block suspicious IP in Cloud Armor
gcloud compute security-policies rules create 100 \
  --security-policy=pull-production-api-waf \
  --src-ip-ranges="ATTACKER_IP/32" \
  --action=deny-403 \
  --description="Incident $(date +%Y%m%d): Block attacker IP"

# Enable stricter WAF rules
gcloud compute security-policies rules update 2000 \
  --security-policy=pull-production-api-waf \
  --rate-limit-threshold-count=100 \
  --rate-limit-threshold-interval-sec=60
```

**Application Level:**

```bash
# Force logout all users (Redis)
kubectl exec -it $(kubectl get pod -l app=redis -o jsonpath='{.items[0].metadata.name}' -n pull) -n pull -- \
  redis-cli FLUSHDB

# Disable specific user account
# Via admin API or direct database
curl -X POST "https://api.pull.app/api/admin/users/USER_ID/disable" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Revoke specific API key
# Update Secret Manager to remove compromised key
```

**Infrastructure Level:**

```bash
# Isolate compromised pod
kubectl cordon NODE_NAME

# Scale down compromised deployment
kubectl scale deployment/DEPLOYMENT_NAME --replicas=0 -n pull

# Create network policy to isolate namespace
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: emergency-isolate
  namespace: pull
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF
```

---

## 4. Incident-Specific Playbooks

### 4.1 Credential Compromise

**Indicators:**
- Unauthorized login alerts
- API keys used from unusual locations
- Password reset requests not initiated by user

**Response Steps:**

1. **Immediate (0-15 min):**
   ```bash
   # Identify compromised credential type
   # Disable the credential immediately

   # For JWT_SECRET compromise:
   gcloud secrets versions disable [VERSION] \
     --secret=pull-production-jwt-secret \
     --project=pull-production

   # Force all sessions to re-authenticate
   kubectl exec -it redis-pod -n pull -- redis-cli FLUSHALL
   ```

2. **Short-term (15-60 min):**
   - Generate and deploy new credentials (see secret-rotation.md)
   - Review audit logs for unauthorized access
   - Identify scope of compromise

3. **Investigation:**
   ```bash
   # Check API access logs
   gcloud logging read "resource.type=cloud_run_revision \
     AND httpRequest.status!=401 \
     AND timestamp>=\"$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
     --project=pull-production --limit=1000

   # Check for unusual patterns
   gcloud logging read "protoPayload.authenticationInfo.principalEmail:* \
     AND timestamp>=\"$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
     --project=pull-production
   ```

### 4.2 Data Breach / PII Exposure

**Indicators:**
- Data exfiltration alerts
- Unusual database queries
- Reports of exposed data

**Response Steps:**

1. **Immediate (0-15 min):**
   - Stop the data flow (block access, revoke permissions)
   - Preserve evidence (do not delete logs)
   - Notify Legal and Compliance immediately

2. **Assessment (15-60 min):**
   - Identify what data was accessed/exfiltrated
   - Determine number of affected users
   - Document the attack vector

3. **Legal Requirements:**

   | Timeframe | Action |
   |-----------|--------|
   | 72 hours | GDPR notification to supervisory authority |
   | Varies by state | State AG notification (check state laws) |
   | ASAP | Notify affected users if required |

4. **Notification Decision Tree:**
   ```
   Was PII accessed?
   ├── No -> Document and close
   └── Yes -> Was it encrypted?
       ├── Yes (encryption key not compromised) -> Document, limited notification
       └── No/Key compromised -> Full notification required
           ├── Determine affected users
           ├── Draft notification (see templates)
           ├── Legal review
           └── Send notifications
   ```

### 4.3 DDoS Attack

**Indicators:**
- Sudden traffic spike
- Service degradation
- Cloud Armor rate limit triggers

**Response Steps:**

1. **Immediate (0-5 min):**
   ```bash
   # Enable Cloudflare Under Attack Mode (if using)
   curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/security_level" \
     -H "Authorization: Bearer $CF_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"value":"under_attack"}'

   # Tighten Cloud Armor rate limits
   gcloud compute security-policies rules update 2000 \
     --security-policy=pull-production-api-waf \
     --rate-limit-threshold-count=50 \
     --rate-limit-threshold-interval-sec=60
   ```

2. **Mitigation (5-30 min):**
   - Scale up infrastructure if legitimate traffic mixed
   - Implement geographic restrictions if attack is localized
   - Contact Cloudflare/GCP support for DDoS assistance

3. **Analysis:**
   ```bash
   # Identify attack pattern
   gcloud logging read "resource.type=http_load_balancer \
     AND httpRequest.status=429" \
     --project=pull-production \
     --format="json(httpRequest.remoteIp, httpRequest.requestUrl)" \
     --limit=1000 | jq -r '.[] | .httpRequest.remoteIp' | sort | uniq -c | sort -rn | head -20
   ```

### 4.4 Vulnerability Exploitation

**Indicators:**
- Sentry errors with suspicious payloads
- WAF blocks for SQLi/XSS
- Unusual application behavior

**Response Steps:**

1. **Immediate:**
   - Determine if exploitation was successful
   - Block attacker if ongoing
   - Preserve request logs

2. **Assessment:**
   ```bash
   # Check for SQL injection attempts
   gcloud logging read "jsonPayload.message:\"SQL\" OR jsonPayload.message:\"injection\"" \
     --project=pull-production \
     --freshness=24h

   # Check for successful exploitation
   # Look for unusual data access patterns, errors, etc.
   ```

3. **Patching:**
   - Develop and test fix
   - Deploy to staging
   - Deploy to production (emergency change if SEV-1)

### 4.5 Insider Threat

**Indicators:**
- Unusual data access by employee
- Access outside normal hours/patterns
- Data downloads before resignation

**Response Steps:**

1. **Coordination:**
   - Involve HR and Legal immediately
   - Maintain confidentiality
   - Document carefully

2. **Evidence Preservation:**
   ```bash
   # Export access logs for the user
   gcloud logging read "protoPayload.authenticationInfo.principalEmail=\"user@pull.app\"" \
     --project=pull-production \
     --freshness=30d \
     --format=json > evidence/user_access_logs.json

   # Preserve cloud audit logs
   gcloud logging read "protoPayload.serviceName=\"secretmanager.googleapis.com\" \
     AND protoPayload.authenticationInfo.principalEmail=\"user@pull.app\"" \
     --project=pull-production \
     --freshness=90d \
     --format=json > evidence/user_secret_access.json
   ```

3. **Access Revocation:**
   - Coordinate timing with HR
   - Revoke all access simultaneously
   - Change shared credentials

### 4.6 Third-Party Breach

**When a vendor reports a breach:**

1. **Assessment:**
   - What data did we share with vendor?
   - Was our data affected?
   - What access did vendor have to our systems?

2. **Containment:**
   - Revoke vendor API keys
   - Block vendor IP ranges if needed
   - Review integration logs

3. **Documentation:**
   - Vendor's breach notification
   - Our assessment of impact
   - Actions taken

---

## 5. Communication Templates

### 5.1 Internal Incident Notification

```
Subject: [SEV-X] Security Incident - [Brief Description]

Team,

We are responding to a security incident. Here are the current details:

**Status:** [Investigating/Contained/Resolved]
**Severity:** [SEV-1/2/3/4]
**Started:** [Timestamp UTC]

**Summary:**
[2-3 sentence description]

**Current Actions:**
- [Action 1]
- [Action 2]

**Incident Commander:** [Name]
**War Room:** #security-incidents (Slack) / [Zoom link]

**DO NOT** discuss this incident outside this channel or with external parties.

Updates will follow every [30 min/1 hour].
```

### 5.2 Executive Summary

```
EXECUTIVE SECURITY INCIDENT SUMMARY
===================================
Date: [YYYY-MM-DD]
Severity: [SEV-X]
Status: [Investigating/Contained/Resolved]

SUMMARY:
[Brief non-technical description of what happened]

BUSINESS IMPACT:
- Users affected: [Number]
- Service downtime: [Duration]
- Data affected: [Type, if any]
- Regulatory notification required: [Yes/No]

ACTIONS TAKEN:
1. [Action and time]
2. [Action and time]

NEXT STEPS:
- [Planned action]

ESTIMATED RESOLUTION:
[Timeframe]
```

### 5.3 User Notification (Data Breach)

```
Subject: Important Security Notice from PULL

Dear [User Name],

We are writing to inform you of a security incident that may have affected your data.

WHAT HAPPENED:
On [date], we discovered [brief description]. We immediately [actions taken].

WHAT INFORMATION WAS INVOLVED:
[List specific data types affected]

WHAT WE ARE DOING:
- [Action 1]
- [Action 2]
- [Offering credit monitoring if applicable]

WHAT YOU CAN DO:
1. Change your password at [link]
2. Review your account for suspicious activity
3. [Additional recommendations]

If you have questions, please contact our support team at security@pull.app.

We take the security of your information seriously and deeply regret this incident.

Sincerely,
The PULL Security Team
```

### 5.4 Regulatory Notification (GDPR)

```
DATA BREACH NOTIFICATION - SUPERVISORY AUTHORITY

1. Name and contact details of controller:
   PULL App, Inc.
   [Address]
   DPO: dpo@pull.app

2. Nature of breach:
   [Description]
   Date discovered: [Date]
   Date breach occurred: [Date if known]

3. Categories and approximate number of data subjects:
   [Number] users affected
   Categories: [Customer/Employee/etc.]

4. Categories and approximate number of records:
   [Types of data]
   Approximate records: [Number]

5. Likely consequences:
   [Description of potential impact]

6. Measures taken/proposed:
   [List of actions]

7. Contact for more information:
   [Name, email, phone]
```

---

## 6. Post-Incident Procedures

### 6.1 Evidence Preservation

**Before Closing Incident:**

```bash
# Create evidence archive
mkdir -p incident-$(date +%Y%m%d)-evidence

# Export relevant logs
gcloud logging read "timestamp>=\"START_TIME\" AND timestamp<=\"END_TIME\"" \
  --project=pull-production \
  --format=json > incident-evidence/all_logs.json

# Export specific resources
kubectl get events -n pull --sort-by='.lastTimestamp' > incident-evidence/k8s_events.txt
kubectl logs -l app=pull-api -n pull --since=24h > incident-evidence/api_logs.txt

# Hash all evidence files
sha256sum incident-evidence/* > incident-evidence/checksums.sha256

# Upload to secure storage
gsutil cp -r incident-evidence/ gs://pull-security-incidents/$(date +%Y%m%d)/
```

### 6.2 Incident Timeline

```markdown
# Incident Timeline: [INCIDENT_ID]

## Pre-Incident
- [T-X] [Any relevant prior events]

## Detection
- [T+0] [How incident was detected]

## Response
- [T+5min] First responder acknowledged
- [T+15min] Incident Commander engaged
- [T+30min] [Containment action]
- [T+1hr] [Additional action]

## Resolution
- [T+Xhr] [How incident was resolved]

## Post-Incident
- [T+Xd] Retrospective held
- [T+Xd] Remediation items assigned
```

### 6.3 Blameless Retrospective

**Schedule:** Within 1 week of SEV-1/SEV-2 incidents

**Attendees:** IRT, affected team leads, optional observers

**Agenda:**

1. **Timeline Review (15 min)**
   - Walk through what happened
   - Correct any inaccuracies

2. **What Went Well (10 min)**
   - Effective responses
   - Tools/processes that helped

3. **What Didn't Go Well (15 min)**
   - Delays in response
   - Missing information
   - Tool/process gaps

4. **Root Cause Analysis (20 min)**
   - Use "5 Whys" technique
   - Identify contributing factors

5. **Action Items (15 min)**
   - Assign specific remediation tasks
   - Set deadlines
   - Prioritize by impact

**Output:** Retrospective document with action items in JIRA

### 6.4 Remediation Tracking

| ID | Finding | Severity | Owner | Due Date | Status |
|----|---------|----------|-------|----------|--------|
| 1 | [Finding from incident] | High | [Name] | [Date] | Open |
| 2 | [Finding from incident] | Medium | [Name] | [Date] | Open |

### 6.5 Metrics to Track

| Metric | Target | Current |
|--------|--------|---------|
| Mean Time to Detect (MTTD) | < 15 min | |
| Mean Time to Respond (MTTR) | < 30 min | |
| Mean Time to Contain (MTTC) | < 1 hour | |
| Mean Time to Resolve (MTTR) | < 4 hours | |
| Incidents per Quarter | < 5 | |
| Post-incident actions completed on time | > 90% | |

### 6.6 Incident Report Template

```markdown
# Security Incident Report

**Incident ID:** INC-YYYY-NNNN
**Date:** [YYYY-MM-DD]
**Severity:** [SEV-1/2/3/4]
**Status:** Closed

## Executive Summary
[2-3 paragraph summary for leadership]

## Incident Details

### Timeline
[Detailed timeline]

### Technical Analysis
[What happened technically]

### Root Cause
[What allowed this to happen]

### Impact
- Users affected: X
- Data affected: [Types]
- Financial impact: $X
- Service downtime: X hours

## Response Evaluation
- Detection: [Effective/Needs Improvement]
- Containment: [Effective/Needs Improvement]
- Communication: [Effective/Needs Improvement]

## Remediation Actions

| Action | Owner | Status | Due Date |
|--------|-------|--------|----------|
| | | | |

## Lessons Learned
1. [Lesson]
2. [Lesson]

## Appendices
- A: Detailed logs
- B: Evidence inventory
- C: Communication records
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-25 | Security Team | Initial playbook |

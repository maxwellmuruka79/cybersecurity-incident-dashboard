# Database Schema

## 1. Profiles

* id: User identifier linked to Supabase authentication.
* full_name: User's display name.
* created_at: Account profile creation timestamp.

## 2. Security Events

* id: Unique event identifier.
* event_type: Type of security event.
* source_ip: Source IP address associated with the simulated event.
* severity: Event severity.
* description: Explanation of the event.
* status: Event processing or review status.
* created_at: Event timestamp.

## 3. Detection Rules

* id: Unique rule identifier.
* name: Rule name.
* description: What the rule detects.
* threshold: Configurable detection threshold where applicable.
* enabled: Whether the rule is active.
* created_at: Rule creation timestamp.

## 4. Alerts

* id: Unique alert identifier.
* security_event_id: Related security event.
* detection_rule_id: Rule that triggered the alert, where applicable.
* title: Alert title.
* severity: Alert severity.
* status: Alert review status.
* created_at: Alert creation timestamp.

## 5. Incidents

* id: Unique incident identifier.
* alert_id: Related alert, where applicable.
* title: Incident title.
* category: Incident category.
* severity: Incident severity.
* status: Incident lifecycle status.
* description: Incident details.
* assigned_to: Responsible user, where applicable.
* investigation_notes: Notes recorded during investigation.
* created_at: Incident creation timestamp.
* updated_at: Last update timestamp.

## Relationships

* A profile may be assigned multiple incidents.
* A security event may trigger an alert.
* A detection rule may trigger multiple alerts.
* An alert may be associated with an incident.
* An incident may be assigned to a profile.

Note: These are proposed logical fields. Database types, foreign keys, constraints, and access policies will be finalized during implementation.

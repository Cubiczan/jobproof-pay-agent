## MODIFIED Requirements

### Requirement: Text gate before payout
Before creating a contractor payout, the system SHALL send the written payout request (who, amount, and reason) to the Jev System One HTTP API as text when `JEV_API_KEY` is set. The request SHALL be a single POST to the host the app already uses (`https://thejevai.com/v1/systemone`, unless `JEV_API_URL` overrides it) and SHALL include both a Choice whose options are `approve` and `hold` and a Noul asking whether the note disputes, changes, or fails to support this payout. The system SHALL NOT send image bytes or image URLs. The system SHALL NOT ask Jev to compute an amount or write a legal judgment. The system SHALL NOT replace PayPal order creation, capture, or the payout call itself.

#### Scenario: One request, two questions
- **WHEN** a payout is attempted and `JEV_API_KEY` is set
- **THEN** the system POSTs one `{ model, state, questions }` body with a Bearer token, a Choice of `approve` and `hold`, and a dispute Noul, over the written who, amount, and reason

#### Scenario: No images
- **WHEN** the payout request is built from a job that has proof photos
- **THEN** the System One state and questions do not include those images

### Requirement: Hold stops the payout
The system SHALL NOT create a PayPal payout unless the Choice is `approve`, its confidence is at least the named floor 0.85, and the dispute Noul is below 0.5. A Choice of `hold`, any other choice, confidence below 0.85, a missing confidence, a dispute Noul at or above 0.5, a missing or unusable Noul, or a failed call while a key is set SHALL NOT create a payout. The job SHALL record the hold.

#### Scenario: Hold choice
- **WHEN** Jev returns the Choice `hold`
- **THEN** the payout function is not called and the job shows the hold

#### Scenario: Low confidence
- **WHEN** Jev returns the Choice `approve` with confidence below 0.85 and a dispute Noul below 0.5
- **THEN** the payout function is not called

#### Scenario: Dispute Noul
- **WHEN** Jev returns the Choice `approve` with confidence at least 0.85 and a dispute Noul at or above 0.5
- **THEN** the payout function is not called

#### Scenario: Failed call
- **WHEN** `JEV_API_KEY` is set and the System One call fails
- **THEN** the payout function is not called

### Requirement: Approve continues into PayPal
When the Choice is `approve`, its confidence is at least 0.85, and the dispute Noul is below 0.5, the system SHALL continue into the existing payout function. That result SHALL NOT itself create a payout batch id, send the payout, or count as a legal judgment.

#### Scenario: Approve with high confidence and no dispute
- **WHEN** Jev returns the Choice `approve` with confidence at least 0.85 and a dispute Noul below 0.5
- **THEN** the existing payout function is called and any batch id comes from that function

### Requirement: Show the decision
The job UI SHALL show the gate decision. The copy SHALL describe it as a text-only gate, not a legal or financial judgment and not the payout.

#### Scenario: Decision visible
- **WHEN** a payout attempt stored a gate decision
- **THEN** the job screen shows that decision and states that it is not the payout and not a legal judgment

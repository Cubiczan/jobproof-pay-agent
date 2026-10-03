## ADDED Requirements

### Requirement: Text gate before payout
Before creating a contractor payout, the system SHALL send the written payout request (who, amount, and reason) to the Jev System One HTTP API as text when `JEV_API_KEY` is set. The request SHALL use a Choice question whose options are `approve` and `hold`. The system SHALL NOT send image bytes or image URLs. The system SHALL NOT replace PayPal order creation, capture, or the payout call itself.

#### Scenario: Choice request
- **WHEN** a payout is attempted and `JEV_API_KEY` is set
- **THEN** the system POSTs `{ model, state, questions }` with a Bearer token and a Choice of `approve` and `hold` over the written who, amount, and reason

#### Scenario: No images
- **WHEN** the payout request is built from a job that has proof photos
- **THEN** the System One state does not include those images

### Requirement: Missing key keeps the payout path
When `JEV_API_KEY` is unset or blank, the system SHALL NOT call Jev and SHALL create the payout through the existing sandbox path. The system SHALL NOT crash.

#### Scenario: Unset key
- **WHEN** a payout is attempted and `JEV_API_KEY` is unset
- **THEN** Jev is not called and the existing payout function runs

### Requirement: Hold stops the payout
When the Choice is `hold`, or the keyed call fails or returns a choice other than `approve`, the system SHALL NOT create a PayPal payout. The job SHALL record the hold.

#### Scenario: Hold choice
- **WHEN** Jev returns the Choice `hold`
- **THEN** the payout function is not called and the job shows the hold

#### Scenario: Failed call
- **WHEN** `JEV_API_KEY` is set and the System One call fails
- **THEN** the payout function is not called

### Requirement: Approve continues into PayPal
When the Choice is `approve`, the system SHALL continue into the existing payout function. The approve Choice SHALL NOT itself create a payout batch id.

#### Scenario: Approve choice
- **WHEN** Jev returns the Choice `approve`
- **THEN** the existing payout function is called and any batch id comes from that function

### Requirement: Show the decision
The job UI SHALL show the gate decision. The copy SHALL describe it as a text-only gate, not a legal or financial judgment and not the payout.

#### Scenario: Decision visible
- **WHEN** a payout attempt stored a gate decision
- **THEN** the job screen shows that decision

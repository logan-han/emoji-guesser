# Data Safety form answers

Use these answers when filling out the Data Safety section in Play Console.

## Data collection and sharing

**Does your app collect or share any of the required user data types?**
- Answer: **No**

Rationale:
- Player display name is not linked to an account or identifier and is never stored beyond the live game session.
- Anonymous session UUID is generated on-device and only used to resume games. It does not identify the user.
- All real-time messages traverse our WebSocket gateway and Supabase Realtime, none are retained beyond game lifecycle.

## Data security

**Is all of the user data collected by your app encrypted in transit?**
- Answer: **Yes** (TLS via WSS).

**Do you provide a way for users to request that their data be deleted?**
- Answer: **N/A** (no data is retained beyond active game).

## Optional questions

**Account creation required?** No.
**Family policy applicable?** Likely yes (target 13+, no profile data, no ads, no payments).
**Government apps policy?** No.
